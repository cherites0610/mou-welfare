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

/** worker 心跳：/health 用來確認背景工作程序還活著（docs/testing.md §9.2） */
export const workerHeartbeat = pgTable('worker_heartbeat', {
  name: text('name').primaryKey(),
  beatAt: timestamp('beat_at', { withTimezone: true }).notNull().default(sql`now()`),
})
