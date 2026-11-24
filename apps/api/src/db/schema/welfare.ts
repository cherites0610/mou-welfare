// 福利資料（docs/backend.md §5）。身分、類別用 text[] + GIN 索引，查詢用 && / @>（修正 v1 對 simple-array 用 IN 的錯誤 → R3）。
import { sql } from 'drizzle-orm'
import { check, date, index, jsonb, pgTable, primaryKey, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core'
import { user } from './auth.ts'

/**
 * pending：爬蟲剛送來、尚未結構化（不出現在搜尋）
 * active：已結構化、可搜尋
 * rejected：結構化時判斷不是個人可申請的福利（機構管理、宣導、報告等）
 * expired：超過截止日
 * removed：來源網頁都已下架
 */
export const WELFARE_STATUSES = ['pending', 'active', 'rejected', 'expired', 'removed'] as const
/** 前台看得到的狀態：過期的仍可查看（標示已過期）；待整理、判為雜訊、已下架的一律當作不存在 */
export const PUBLIC_STATUSES = ['active', 'expired'] as const
/** 結構化方式：llm＝Gemini；rules＝沒有 LLM 金鑰時的關鍵字規則（有金鑰後會重新結構化） */
export const STRUCTURED_BY = ['llm', 'rules'] as const

export const welfarePrograms = pgTable(
  'welfare_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 爬蟲產生，例如 "kinmen:中低收入老人生活津貼"，用來合併跨年度的同一福利 */
    programKey: text('program_key').notNull().unique(),
    city: text('city').notNull(),
    name: text('name').notNull(),
    categories: text('categories').array().notNull().default(sql`'{}'`),
    identities: text('identities').array().notNull().default(sql`'{}'`),
    summary: text('summary').notNull().default(''),
    requirements: text('requirements').array().notNull().default(sql`'{}'`),
    rewards: text('rewards').array().notNull().default(sql`'{}'`),
    contentMd: text('content_md').notNull().default(''),
    sourceUrl: text('source_url').notNull(),
    sourceKind: text('source_kind').notNull(),
    publishedAt: date('published_at', { mode: 'string' }),
    deadline: date('deadline', { mode: 'string' }),
    status: text('status', { enum: WELFARE_STATUSES }).notNull().default('pending'),
    siteId: text('site_id'),
    contentHash: text('content_hash'),
    /** 開放資料原本就有的結構化欄位（資格、應備文件等） */
    sourceFields: jsonb('source_fields').$type<Record<string, unknown>>().notNull().default({}),
    /** 最後一次結構化時的 content_hash；和 content_hash 不同就表示需要重新結構化 */
    structuredHash: text('structured_hash'),
    structuredBy: text('structured_by', { enum: STRUCTURED_BY }),
    structuredAt: timestamp('structured_at', { withTimezone: true }),
    /** 目前結果是哪個模型、哪一版 prompt 做的（規則結構化時為 null；docs/backend.md §8.3.2） */
    structuredModel: text('structured_model'),
    structuredPromptVersion: text('structured_prompt_version'),
    /**
     * 管理者的人工判定（docs/admin.md）：有值時結構化不改變狀態（active 但已過截止日仍會變 expired），
     * 讓 LLM 重做或內容更新時不會把人工修正蓋掉。
     */
    statusOverride: text('status_override', { enum: ['active', 'rejected'] }),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    /** 置頂：有值的福利在搜尋結果中排最前面（越晚置頂越前面）。目前用於開發用的範例資料，之後給管理端使用 */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    structureError: text('structure_error'),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('welfare_identities_gin').using('gin', t.identities),
    index('welfare_categories_gin').using('gin', t.categories),
    index('welfare_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
    index('welfare_summary_trgm').using('gin', t.summary.op('gin_trgm_ops')),
    index('welfare_city_status_idx').on(t.city, t.status),
    index('welfare_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('welfare_site_idx').on(t.siteId),
    check('welfare_status_check', sql`${t.status} in ('pending', 'active', 'rejected', 'expired', 'removed')`),
  ],
)

export const welfareAttachments = pgTable(
  'welfare_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => welfarePrograms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    text: text('text').notNull().default(''),
  },
  (t) => [index('welfare_attachments_program_idx').on(t.programId)],
)

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => welfarePrograms.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.programId] }), index('favorites_program_idx').on(t.programId)],
)

/** 一個福利可能來自多個網址（同一福利出現在多個分類、或跨年度的公告），下架時全部網址都消失才標為 removed */
export const welfareSources = pgTable(
  'welfare_sources',
  {
    url: text('url').primaryKey(),
    programId: uuid('program_id')
      .notNull()
      .references(() => welfarePrograms.id, { onDelete: 'cascade' }),
    siteId: text('site_id').notNull(),
    contentHash: text('content_hash').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('welfare_sources_program_idx').on(t.programId), index('welfare_sources_site_idx').on(t.siteId)],
)

export const INGEST_ACTIONS = ['created', 'updated', 'unchanged', 'removed'] as const

/** 爬蟲推送紀錄：排查「為什麼這筆沒更新」用 */
export const ingestLog = pgTable(
  'ingest_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programKey: text('program_key'),
    sourceUrl: text('source_url').notNull(),
    action: text('action', { enum: INGEST_ACTIONS }).notNull(),
    contentHash: text('content_hash'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ingest_log_received_idx').on(t.receivedAt), index('ingest_log_key_idx').on(t.programKey)],
)
