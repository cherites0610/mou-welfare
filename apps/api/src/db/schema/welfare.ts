// 福利資料（docs/backend.md §5）。身分、類別用 text[] + GIN 索引，查詢用 && / @>（修正 v1 對 simple-array 用 IN 的錯誤 → R3）。
import { sql } from 'drizzle-orm'
import { check, date, index, pgTable, primaryKey, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core'
import { user } from './auth.ts'

export const WELFARE_STATUSES = ['active', 'expired', 'removed'] as const

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
    status: text('status', { enum: WELFARE_STATUSES }).notNull().default('active'),
    contentHash: text('content_hash'),
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
    check('welfare_status_check', sql`${t.status} in ('active', 'expired', 'removed')`),
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
