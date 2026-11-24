// 阿哞聊天（docs/backend.md §8.9）。對話紀錄存在自己的資料庫，不使用供應商的 thread 功能。
import { sql } from 'drizzle-orm'
import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth.ts'
import { families } from './family.ts'

/** 這段對話目前的條件（features/chat/parse.ts 的 ChatFilters），追問時沿用 */
export type ChatFiltersJson = { cities: string[]; identities: string[]; categories: string[]; topic: string; query: string }

/** 助理訊息附帶的資訊：福利卡、這一輪的條件、模式（llm＝LLM 回答；fallback＝LLM 不可用，固定格式） */
export type ChatMessageMeta = {
  sources?: unknown[]
  filters?: ChatFiltersJson
  mode?: 'llm' | 'fallback'
  model?: string
  error?: string
}

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 最近一次使用的家庭模式；家庭刪除後清空 */
    familyId: uuid('family_id').references(() => families.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    /** web＝網站；line＝LINE Bot（同一個使用者共用每日次數，網站的歷史對話也看得到） */
    channel: text('channel', { enum: ['web', 'line'] }).notNull().default('web'),
    filters: jsonb('filters').$type<ChatFiltersJson | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_sessions_user_idx').on(t.userId, t.updatedAt)],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    /** user | assistant */
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<ChatMessageMeta>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_messages_session_idx').on(t.sessionId, t.createdAt)],
)

/**
 * 每人每日的訊息數（臺北時間的日期）。和對話分開存：刪除對話不會讓次數歸零；
 * 以條件式 upsert 原子地加一，同時送出的請求也不會超過上限。
 */
export const chatUsage = pgTable(
  'chat_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)
