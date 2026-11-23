import { sql } from 'drizzle-orm'
import { bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const faqs = pgTable(
  'faqs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    sort: integer('sort').notNull().default(0),
    published: boolean('published').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('faqs_sort_idx').on(t.sort)],
)

/**
 * LLM 額度不足時暫停結構化（docs/backend.md §8.4.1）。有一列就代表暫停中；
 * 背景工作定期送極小的請求探測，成功後刪除這一列並恢復。
 */
export const llmPause = pgTable('llm_pause', {
  name: text('name').primaryKey(),
  reason: text('reason').notNull(),
  pausedAt: timestamp('paused_at', { withTimezone: true }).notNull().defaultNow(),
  probedAt: timestamp('probed_at', { withTimezone: true }),
})

/**
 * 每一次 LLM API 呼叫的用量（docs/backend.md §8.3.2），包括失敗與 schema 不合格後的重試。
 * program_id 不設外鍵：福利刪除後仍保留紀錄以便查帳。cost_usd 是當下依 lib/llm/pricing.ts 算的預估值。
 */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    purpose: text('purpose').notNull(),
    programId: uuid('program_id'),
    model: text('model').notNull(),
    promptVersion: text('prompt_version'),
    attempt: integer('attempt').notNull().default(1),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    thoughtsTokens: integer('thoughts_tokens'),
    totalTokens: integer('total_tokens'),
    inputChars: integer('input_chars').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    errorKind: text('error_kind'),
    error: text('error'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => [index('llm_calls_created_idx').on(t.createdAt), index('llm_calls_program_idx').on(t.programId)],
)

/**
 * 管理端稽核紀錄（docs/admin.md）：查看使用者個資、修改福利、重新結構化都會寫一列。
 * admin_id 不設外鍵：管理者帳號刪除後紀錄仍保留。
 */
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    adminId: text('admin_id').notNull(),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
  },
  (t) => [index('admin_audit_at_idx').on(t.at), index('admin_audit_target_idx').on(t.targetType, t.targetId)],
)

/** worker 心跳：/health 用來確認背景工作程序還活著（docs/testing.md §9.2） */
export const workerHeartbeat = pgTable('worker_heartbeat', {
  name: text('name').primaryKey(),
  beatAt: timestamp('beat_at', { withTimezone: true }).notNull().default(sql`now()`),
})

/** 爬蟲的每站結果（services/scraper 的 SiteResult，見 features/scraper/schema.ts） */
export type ScrapeSiteResult = {
  siteId: string
  city: string | null
  seen: number
  new: number
  updated: number
  unchanged: number
  removed: number
  filtered: number
  quarantined: number
  pushed: number
  pushFailed: number
  pages: number
  health: 'ok' | 'degraded' | 'blocked' | 'failed'
  healthDetail: string
  errors: string[]
  errorCount: number
  quarantine: { title: string; url: string; issues: string[] }[]
  startedAt: string
  finishedAt: string
}

/**
 * 爬蟲的每次執行（docs/scraper.md §6.7、docs/admin.md）。爬蟲在開始、每站結束、全部結束時各回報一次
 * （POST /internal/scrape-runs），管理後台據此顯示進度與各站狀態；背景工作據此判斷逾期與中斷。
 */
export const scrapeRuns = pgTable(
  'scrape_runs',
  {
    /** 爬蟲的 run_id（YYYYMMDD-HHMMSS，臺北時間） */
    id: text('id').primaryKey(),
    /** schedule＝排程；manual＝手動執行 */
    trigger: text('trigger').notNull(),
    /** running | ok | warning（有站點不是 ok）| interrupted（逾時沒有回報，程序可能中斷） */
    status: text('status').notNull(),
    /** 排程間隔（天），用來判斷下一次是否逾期 */
    intervalDays: integer('interval_days'),
    planned: text('planned').array().notNull().default([]),
    current: text('current'),
    sites: jsonb('sites').$type<ScrapeSiteResult[]>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scrape_runs_started_idx').on(t.startedAt)],
)

/** 系統通知的去重：同一個狀況（key）在 value 不變時，間隔一段時間才再寄一次 */
export const alertState = pgTable('alert_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
})
