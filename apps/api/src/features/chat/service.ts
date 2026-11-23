// 阿哞聊天（docs/backend.md §8.9）：對話、次數限制、一則訊息的流程。
// 只有「產生文字」交給 LLM；LLM 不可用時退回固定格式，仍然列出找到的福利。
import type { MatchProfile } from '@mou-welfare/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { type ChatMessageMeta, chatMessages, chatSessions, chatUsage, llmPause } from '../../db/schema/index.ts'
import { ApiError } from '../../lib/errors.ts'
import { type LLM, LLMError, type Message } from '../../lib/llm/index.ts'
import type { FamilyProfile } from '../family/service.ts'
import { type ChatFilters, mergeFilters, parseQuery } from './parse.ts'
import { buildPrompt, CitationRewriter, EMPTY_TEXT, fallbackText, HISTORY_MESSAGES } from './prompt.ts'
import { retrieve, type Source } from './retrieve.ts'

/** 每人每日的訊息上限（臺北時間） */
export const DAILY_LIMIT = 30
export const MAX_MESSAGE_CHARS = 500
const SESSION_LIST_LIMIT = 50
const TITLE_CHARS = 30

/** 臺北時間的日期（YYYY-MM-DD） */
export const taipeiDay = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)

export async function quota(db: Db, userId: string, now = new Date()) {
  const [row] = await db
    .select({ count: chatUsage.count })
    .from(chatUsage)
    .where(and(eq(chatUsage.userId, userId), eq(chatUsage.day, taipeiDay(now))))
  return { limit: DAILY_LIMIT, used: row?.count ?? 0 }
}

/** 原子地用掉一則：已達上限時不加、回傳 false（同時送出的請求也不會超過） */
export async function takeQuota(db: Db, userId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .insert(chatUsage)
    .values({ userId, day: taipeiDay(now), count: 1 })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: { count: sql`${chatUsage.count} + 1` },
      setWhere: sql`${chatUsage.count} < ${DAILY_LIMIT}`,
    })
    .returning({ count: chatUsage.count })
  return rows.length > 0
}

/** 對話的擁有者檢查：別人的對話一律回 404（不透露是否存在） */
export async function assertChatOwner(db: Db, sessionId: string, userId: string) {
  const [s] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
  if (!s) throw new ApiError(404, 'not_found', '找不到這個對話')
  return s
}

const sessionOut = (s: typeof chatSessions.$inferSelect) => ({
  id: s.id,
  title: s.title,
  familyId: s.familyId,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
})

export async function listSessions(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(SESSION_LIST_LIMIT)
  return rows.map(sessionOut)
}

export async function createSession(db: Db, userId: string) {
  const [s] = await db.insert(chatSessions).values({ userId }).returning()
  return sessionOut(s!)
}

export async function getSession(db: Db, sessionId: string, userId: string) {
  const s = await assertChatOwner(db, sessionId, userId)
  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.role))
  return {
    ...sessionOut(s),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: (m.metadata.sources ?? []) as Source[],
      mode: m.metadata.mode ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function deleteSession(db: Db, sessionId: string, userId: string) {
  await assertChatOwner(db, sessionId, userId)
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId))
}

export type ChatEvent =
  | { event: 'sources'; data: { sources: Source[] } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { messageId: string; mode: 'llm' | 'fallback'; content: string } }

export type SendInput = {
  sessionId: string
  userId: string
  content: string
  /** 個人資料（未套用時為 null）；居住縣市在沒提到縣市時當作篩選 */
  profile: (MatchProfile & { city?: string | null }) | null
  family: FamilyProfile[] | null
  familyId: string | null
  now?: Date
}

/** 可用的 LLM：有金鑰（不是規則模式），而且沒有因額度不足暫停（§8.4.1）；不可用時回傳 null */
async function availableLLM(db: Db, llm: LLM | null): Promise<LLM | null> {
  if (!llm) return null
  const [paused] = await db.select({ name: llmPause.name }).from(llmPause).limit(1)
  return paused ? null : llm
}

/** 歷史訊息裡的 [[福利 id]] 對 LLM 沒有意義，送出前拿掉 */
const stripCitations = (s: string) => s.replace(/\[\[[0-9a-f-]{36}\]\]/g, '')

/**
 * 一則訊息：解析條件 → 檢索與資格比對 → 先送福利卡 → LLM 串流（或固定格式）→ 存檔。
 * 擁有者、家庭成員、次數的檢查在呼叫前完成（那些錯誤要回一般的 HTTP 狀態碼，不是 SSE）。
 */
export async function* sendMessage(db: Db, llm: LLM | null, input: SendInput): AsyncGenerator<ChatEvent> {
  const now = input.now ?? new Date()
  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, input.sessionId))
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, input.sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(HISTORY_MESSAGES)

  const filters = mergeFilters(parseQuery(input.content), input.content, (session?.filters as ChatFilters | null) ?? null, input.profile?.city ?? null)
  const model = await availableLLM(db, llm)

  // 問題的 embedding 失敗時只用關鍵字與條件，聊天照常
  let embedding: number[] | null = null
  if (model) {
    embedding = await model
      .embed([filters.query], { purpose: 'chat' }, 'query')
      .then((v) => v[0] ?? null)
      .catch((e: unknown) => {
        console.warn('[chat] embed failed', e instanceof Error ? e.message : e)
        return null
      })
  }
  const base = { embedding, profile: input.profile, family: input.family, today: now }
  let sources = await retrieve(db, { ...base, filters })
  // 篩選的縣市完全沒有資料（還沒收錄）時，改列其他縣市的，並在回答中說明
  const cityMissing = sources.length === 0 && filters.cities.length > 0
  if (cityMissing) sources = await retrieve(db, { ...base, filters: { ...filters, cities: [] } })
  yield { event: 'sources', data: { sources } }

  await db.insert(chatMessages).values({ sessionId: input.sessionId, role: 'user', content: input.content, createdAt: now })

  let mode: 'llm' | 'fallback' = 'fallback'
  let content = sources.length ? fallbackText(sources, cityMissing) : EMPTY_TEXT
  let error: string | undefined
  if (model && sources.length) {
    const prompt = buildPrompt({
      question: input.content,
      history: history.reverse().map((m) => ({ role: m.role, content: stripCitations(m.content) }) as Message),
      filters,
      sources,
      profile: input.profile,
      family: input.family,
      cityMissing,
      today: now,
    })
    const rewriter = new CitationRewriter(sources.map((s) => s.id))
    let text = ''
    try {
      for await (const chunk of model.stream({ ...prompt, meta: { purpose: 'chat' } })) {
        const out = rewriter.push(chunk)
        if (out) {
          text += out
          yield { event: 'delta', data: { text: out } }
        }
      }
      text += rewriter.flush()
      if (text.trim()) {
        mode = 'llm'
        content = text
      }
    } catch (e) {
      // 串流到一半失敗也改用固定格式（done 的 content 會取代已經送出的文字）
      error = e instanceof LLMError ? `${e.kind}: ${e.message.slice(0, 200)}` : String(e).slice(0, 200)
      console.warn('[chat] llm failed', error)
    }
  }

  const metadata: ChatMessageMeta = { sources, filters, mode, ...(mode === 'llm' && model ? { model: model.model } : {}), ...(error ? { error } : {}) }
  const [assistant] = await db
    .insert(chatMessages)
    // 與使用者訊息同一個時間點時，排序以 role 區分（user 在前）
    .values({ sessionId: input.sessionId, role: 'assistant', content, metadata, createdAt: new Date(Math.max(Date.now(), now.getTime() + 1)) })
    .returning({ id: chatMessages.id })
  await db
    .update(chatSessions)
    .set({
      filters,
      familyId: input.familyId,
      updatedAt: new Date(),
      ...(session && !session.title ? { title: input.content.replace(/\s+/g, ' ').slice(0, TITLE_CHARS) } : {}),
    })
    .where(eq(chatSessions.id, input.sessionId))
  yield { event: 'done', data: { messageId: assistant!.id, mode, content } }
}
