// LINE Bot（docs/backend.md §8.7）：處理一個 webhook 事件，由背景工作執行（jobs/index.ts 的 line-event）。
// - 已用 LINE 登入過哞福利的人：交給聊天服務（和網站共用每日次數，對話也出現在網站的歷史對話）
// - 還沒登入的人：不呼叫 LLM，只列出相關福利，附上 LIFF 登入按鈕
import { and, desc, eq, gt } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { account, chatSessions, user } from '../../db/schema/index.ts'
import type { Env } from '../../env.ts'
import { LineApiError, type LineBot, type LineMessage } from '../../lib/line.ts'
import type { LLM } from '../../lib/llm/index.ts'
import { mergeFilters, parseQuery } from '../chat/parse.ts'
import { EMPTY_TEXT } from '../chat/prompt.ts'
import { retrieve, type Source } from '../chat/retrieve.ts'
import { DAILY_LIMIT, MAX_MESSAGE_CHARS, sendMessage, takeQuota } from '../chat/service.ts'
import { profileOf } from '../welfare/service.ts'
import { carousel, loginPrompt, text, toLineText } from './format.ts'

/** 隔這麼久沒說話就開新對話（追問沿用上一輪的條件，隔太久的訊息多半是新問題） */
export const SESSION_IDLE_MS = 30 * 60_000

/** webhook 事件（只列出用到的欄位，見 LINE Messaging API 文件） */
export type LineEvent = {
  type: string
  mode?: string
  webhookEventId?: string
  replyToken?: string
  source?: { type: string; userId?: string }
  message?: { type: string; text?: string }
}

export type LineContext = {
  db: Db
  llm: LLM | null
  line: LineBot
  env: Pick<Env, 'LINE_LIFF_ID' | 'WEB_BASE_URL'>
  now?: Date
}

export type LineOutcome = 'answered' | 'guest' | 'limited' | 'welcomed' | 'unsupported' | 'skipped'

/** 用 LINE 登入過的帳號：LINE Login 與 Messaging API 在同一個 provider 時，使用者 ID 相同 */
export async function linkedUser(db: Db, lineUserId: string) {
  const [row] = await db
    .select({ user })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(account.providerId, 'line'), eq(account.accountId, lineUserId)))
    .limit(1)
  return row?.user ?? null
}

/** 沿用最近一段 LINE 對話；隔太久或沒有時開新的 */
async function lineSession(db: Db, userId: string, now: Date): Promise<string> {
  const [recent] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.userId, userId), eq(chatSessions.channel, 'line'), gt(chatSessions.updatedAt, new Date(now.getTime() - SESSION_IDLE_MS))),
    )
    .orderBy(desc(chatSessions.updatedAt))
    .limit(1)
  if (recent) return recent.id
  const [created] = await db.insert(chatSessions).values({ userId, channel: 'line' }).returning({ id: chatSessions.id })
  return created!.id
}

/** reply token 有時效（LLM 回答久一點就可能過期）：失敗時改用 push */
async function send(ctx: LineContext, event: LineEvent, to: string, messages: (LineMessage | null)[]) {
  const list = messages.filter((m): m is LineMessage => m !== null).slice(0, 5)
  if (event.replyToken) {
    try {
      await ctx.line.reply(event.replyToken, list)
      return
    } catch (e) {
      if (!(e instanceof LineApiError)) throw e
      console.warn('[line] reply failed, pushing instead', e.message)
    }
  }
  await ctx.line.push(to, list)
}

function guestText(sources: Source[], cityMissing: boolean) {
  if (!sources.length) return EMPTY_TEXT
  const note = cityMissing ? '\n（這個縣市目前還沒有收錄資料，以下是其他縣市的福利，僅供參考。）' : ''
  return `以下是和你的問題相關的福利：${note}\n\n${sources.map((s, i) => `${i + 1}. ${s.name}（${s.city}）`).join('\n')}\n\n點下方的卡片可以看資格與申請方式。`
}

async function answerGuest(ctx: LineContext, content: string, now: Date) {
  const filters = mergeFilters(parseQuery(content), content, null, null)
  const base = { embedding: null, profile: null, family: null, today: now }
  let sources = await retrieve(ctx.db, { ...base, filters })
  const cityMissing = sources.length === 0 && filters.cities.length > 0
  if (cityMissing) sources = await retrieve(ctx.db, { ...base, filters: { ...filters, cities: [] } })
  return [text(guestText(sources, cityMissing)), carousel(sources, ctx.env.WEB_BASE_URL), loginPrompt(ctx.env.LINE_LIFF_ID, ctx.env.WEB_BASE_URL)]
}

export async function handleLineEvent(ctx: LineContext, event: LineEvent): Promise<LineOutcome> {
  const now = ctx.now ?? new Date()
  // standby：同一個帳號接了其他的聊天服務，不回覆
  if (event.mode && event.mode !== 'active') return 'skipped'
  // 群組與聊天室先不回（不知道是誰在問，也不該把個人的資格比對貼到群組）
  const lineUserId = event.source?.type === 'user' ? event.source.userId : undefined
  if (!lineUserId) return 'skipped'

  if (event.type === 'follow') {
    const linked = await linkedUser(ctx.db, lineUserId)
    const hello = '哞～我是阿哞！直接告訴我你想找什麼福利，例如「臺北的育兒津貼」「我 70 歲住屏東，有什麼補助」。'
    await send(ctx, event, lineUserId, [text(hello), linked ? null : loginPrompt(ctx.env.LINE_LIFF_ID, ctx.env.WEB_BASE_URL)])
    return 'welcomed'
  }
  if (event.type !== 'message' || !event.message) return 'skipped'
  if (event.message.type !== 'text' || !event.message.text?.trim()) {
    await send(ctx, event, lineUserId, [text('阿哞目前只看得懂文字訊息，請用文字告訴我你想找什麼福利喔！')])
    return 'unsupported'
  }

  const content = [...event.message.text.trim()].slice(0, MAX_MESSAGE_CHARS).join('')
  // 「輸入中」的動畫只是提示，失敗不影響回答
  void ctx.line.loading(lineUserId).catch((e: unknown) => console.warn('[line] loading failed', e instanceof Error ? e.message : e))

  const u = await linkedUser(ctx.db, lineUserId)
  if (!u) {
    await send(ctx, event, lineUserId, await answerGuest(ctx, content, now))
    return 'guest'
  }
  if (!(await takeQuota(ctx.db, u.id, now))) {
    await send(ctx, event, lineUserId, [text(`今天的 ${DAILY_LIMIT} 則已經用完了，明天再來問阿哞吧！`)])
    return 'limited'
  }

  const sessionId = await lineSession(ctx.db, u.id, now)
  const profile = { ...profileOf(u)!, city: u.city ?? null }
  let sources: Source[] = []
  let answer = EMPTY_TEXT
  for await (const ev of sendMessage(ctx.db, ctx.llm, { sessionId, userId: u.id, content, profile, family: null, familyId: null, now })) {
    if (ev.event === 'sources') sources = ev.data.sources
    else if (ev.event === 'done') answer = ev.data.content
  }
  await send(ctx, event, lineUserId, [text(toLineText(answer, sources)), carousel(sources, ctx.env.WEB_BASE_URL)])
  return 'answered'
}
