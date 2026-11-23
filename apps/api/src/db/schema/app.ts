import { sql } from 'drizzle-orm'
import { bigserial, boolean, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

/** worker 心跳：/health 用來確認背景工作程序還活著（docs/testing.md §9.2） */
export const workerHeartbeat = pgTable('worker_heartbeat', {
  name: text('name').primaryKey(),
  beatAt: timestamp('beat_at', { withTimezone: true }).notNull().default(sql`now()`),
})
