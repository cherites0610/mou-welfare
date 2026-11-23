// 阿哞聊天 API（docs/backend.md §8.9）。全部需要登入；別人的對話一律 404。
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../../app.ts'
import { apiError } from '../../lib/errors.ts'
import { familyMode } from '../family/service.ts'
import { MatchResultSchema, FamilyMatchSchema } from '../welfare/schema.ts'
import { profileOf } from '../welfare/service.ts'
import {
  assertChatOwner,
  createSession,
  DAILY_LIMIT,
  deleteSession,
  getSession,
  listSessions,
  MAX_MESSAGE_CHARS,
  quota,
  sendMessage,
  takeQuota,
} from './service.ts'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { 'application/json': { schema } } })
const err = (d: string) => json(ErrorSchema, d)
const tags = ['chat']
const security = [{ cookieAuth: [] }]

const Session = z
  .object({ id: z.uuid(), title: z.string(), familyId: z.uuid().nullable(), createdAt: z.string(), updatedAt: z.string() })
  .openapi('ChatSession')
const Quota = z.object({ limit: z.number(), used: z.number() }).openapi('ChatQuota')
const Source = z
  .object({
    id: z.uuid(),
    name: z.string(),
    city: z.string(),
    categories: z.array(z.string()),
    identities: z.array(z.string()),
    summary: z.string(),
    publishedAt: z.string().nullable(),
    deadline: z.string().nullable(),
    requirements: z.array(z.string()),
    rewards: z.array(z.string()),
    score: z.number(),
    match: MatchResultSchema.nullable(),
    familyMatches: z.array(FamilyMatchSchema).nullable(),
  })
  .openapi('ChatSource')
const ChatMessage = z
  .object({
    id: z.uuid(),
    role: z.enum(['user', 'assistant']),
    content: z.string().openapi({ description: 'Markdown；[[福利 id]] 是引用，前端換成福利連結' }),
    sources: z.array(Source),
    mode: z.enum(['llm', 'fallback']).nullable().openapi({ description: 'fallback＝LLM 不可用時的固定格式' }),
    createdAt: z.string(),
  })
  .openapi('ChatMessage')
const SessionDetail = Session.extend({ messages: z.array(ChatMessage) }).openapi('ChatSessionDetail')

const SendBody = z
  .object({
    content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    familyId: z.uuid().nullable().optional().openapi({ description: '家庭模式：附上家人的資格比對（需為成員）' }),
    useProfile: z.boolean().default(true).openapi({ description: '套用個人資料（資格比對、沒提到縣市時用居住縣市）' }),
  })
  .strict()
  .openapi('ChatSendBody')

const IdParam = z.object({ id: z.uuid() })

const routes = {
  list: createRoute({
    method: 'get', path: '/v1/chat/sessions', tags, security, summary: '我的對話（最近 50 個）與今日剩餘次數',
    responses: { 200: json(z.object({ data: z.array(Session), meta: z.object({ quota: Quota }) }), '對話列表') },
  }),
  create: createRoute({
    method: 'post', path: '/v1/chat/sessions', tags, security, summary: '開新對話',
    responses: { 201: json(z.object({ data: Session }), '新對話') },
  }),
  get: createRoute({
    method: 'get', path: '/v1/chat/sessions/{id}', tags, security, summary: '對話內容',
    request: { params: IdParam },
    responses: { 200: json(z.object({ data: SessionDetail }), '對話與訊息'), 404: err('不存在或不是自己的') },
  }),
  remove: createRoute({
    method: 'delete', path: '/v1/chat/sessions/{id}', tags, security, summary: '刪除對話',
    request: { params: IdParam },
    responses: { 204: { description: '已刪除' }, 404: err('不存在或不是自己的') },
  }),
  send: createRoute({
    method: 'post', path: '/v1/chat/sessions/{id}/messages', tags, security,
    summary: '送出訊息（SSE：sources → delta… → done）',
    description:
      'Server-Sent Events。`sources`：找到的福利與燈號（不等 LLM）；`delta`：逐段文字；`done`：訊息 id、模式（llm | fallback）與完整內容（取代逐段文字）。' +
      `每人每日 ${DAILY_LIMIT} 則（臺北時間），超過回 429。`,
    request: { params: IdParam, body: { content: { 'application/json': { schema: SendBody } }, required: true } },
    responses: {
      200: { description: 'SSE 串流', content: { 'text/event-stream': { schema: z.string() } } },
      403: err('不是該家庭成員'),
      404: err('不存在或不是自己的'),
      429: err('今日次數已用完'),
    },
  }),
}

export const chatRoutes = new OpenAPIHono<AppEnv>()
  .openapi(routes.list, async (c) => {
    const { db } = c.var.deps
    const userId = c.var.user!.id
    return c.json({ data: await listSessions(db, userId), meta: { quota: await quota(db, userId) } }, 200)
  })
  .openapi(routes.create, async (c) => c.json({ data: await createSession(c.var.deps.db, c.var.user!.id) }, 201))
  .openapi(routes.get, async (c) => c.json({ data: await getSession(c.var.deps.db, c.req.valid('param').id, c.var.user!.id) }, 200))
  .openapi(routes.remove, async (c) => {
    await deleteSession(c.var.deps.db, c.req.valid('param').id, c.var.user!.id)
    return c.body(null, 204)
  })
  .openapi(routes.send, async (c) => {
    const { db, llm } = c.var.deps
    const u = c.var.user!
    const sessionId = c.req.valid('param').id
    const body = c.req.valid('json')
    // 這些錯誤要在開始串流前回一般的狀態碼
    await assertChatOwner(db, sessionId, u.id)
    const familyId = body.familyId ?? null
    const family = await familyMode(db, familyId ?? undefined, u.id)
    if (!(await takeQuota(db, u.id))) {
      return apiError(c, 429, 'rate_limited', `今天的 ${DAILY_LIMIT} 則已經用完了，明天再來問阿哞吧！`)
    }
    const profile = body.useProfile ? { ...profileOf(u)!, city: u.city ?? null } : null

    // 經過 Caddy（flush_interval -1）與 Cloudflare 時不要被緩衝
    c.header('cache-control', 'no-cache, no-transform')
    c.header('x-accel-buffering', 'no')
    return streamSSE(c, async (stream) => {
      try {
        for await (const ev of sendMessage(db, llm ?? null, { sessionId, userId: u.id, content: body.content, profile, family, familyId })) {
          await stream.writeSSE({ event: ev.event, data: JSON.stringify(ev.data) })
        }
      } catch (e) {
        console.error('[chat] send failed', e)
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: '阿哞出了點問題，請稍後再試' }) })
      }
    }) as never
  })
