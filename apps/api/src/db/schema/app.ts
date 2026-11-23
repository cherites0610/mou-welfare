import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

/** worker 心跳：/health 用來確認背景工作程序還活著（docs/testing.md §9.2） */
export const workerHeartbeat = pgTable('worker_heartbeat', {
  name: text('name').primaryKey(),
  beatAt: timestamp('beat_at', { withTimezone: true }).notNull().default(sql`now()`),
})
