// 阿哞聊天的流程（docs/backend.md §8.9）：FakeLLM，不呼叫真實模型
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { chatMessages, chatSessions, chatUsage, families, familyMembers, llmCalls, llmPause, user } from '../src/db/schema/index.ts'
import { DAILY_LIMIT, taipeiDay } from '../src/features/chat/service.ts'
import { dbUsageRecorder, FakeLLM, LLMError } from '../src/lib/llm/index.ts'
import { createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

/** 每個測試用自己的 LLM（每個請求都從 deps 讀） */
function useLLM<T extends FakeLLM | null>(llm: T): T {
  t.deps.llm = llm
  return llm
}

async function login(email = 'user@example.com', profile: Record<string, unknown> = {}) {
  const { cookie } = await signUp(t, email)
  if (Object.keys(profile).length) await t.db.update(user).set(profile).where(eq(user.email, email))
  const [u] = await t.db.select().from(user).where(eq(user.email, email))
  return { cookie, id: u!.id }
}

const req = (cookie: string, method: string, path: string, body?: unknown) =>
  t.app.request(path, {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

async function newSession(cookie: string) {
  return ((await (await req(cookie, 'POST', '/v1/chat/sessions')).json()) as Json).data.id as string
}

/** 送出訊息並把 SSE 解析成事件陣列 */
async function send(cookie: string, sessionId: string, content: string, extra: object = {}) {
  const res = await req(cookie, 'POST', `/v1/chat/sessions/${sessionId}/messages`, { content, ...extra })
  if (res.status !== 200) return { status: res.status, body: (await res.json()) as Json, events: [] as { event: string; data: Json }[] }
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  const events = (await res.text())
    .split('\n\n')
    .filter((b) => b.trim())
    .map((b) => {
      const event = /^event: (.+)$/m.exec(b)?.[1] ?? 'message'
      const data = JSON.parse(/^data: (.+)$/m.exec(b)?.[1] ?? 'null')
      return { event, data }
    })
  return { status: 200, body: null, events }
}
const done = (events: { event: string; data: Json }[]) => events.find((e) => e.event === 'done')!.data

async function seedPrograms() {
  const birth = await createProgram(t.db, { city: '彰化縣', name: '彰化縣生育補助', summary: '新生兒每胎補助', categories: ['婦女與幼兒福利'] })
  const disabled = await createProgram(t.db, { city: '彰化縣', name: '身心障礙者生育輔導', summary: '身障者生育服務', identities: ['身心障礙者'] })
  const taipei = await createProgram(t.db, { city: '臺北市', name: '臺北市生育獎勵金', summary: '生育補助' })
  await createProgram(t.db, { city: '彰化縣', name: '已過期的生育補助', status: 'expired' })
  return { birth, disabled, taipei }
}

describe('存取', () => {
  it('未登入 401', async () => {
    expect((await t.app.request('/v1/chat/sessions')).status).toBe(401)
    expect((await t.app.request('/v1/chat/sessions', { method: 'POST' })).status).toBe(401)
  })

  it('別人的對話一律 404（讀取、刪除、送訊息；R7）', async () => {
    const a = await login('a@example.com')
    const b = await login('b@example.com')
    const id = await newSession(a.cookie)
    expect((await req(b.cookie, 'GET', `/v1/chat/sessions/${id}`)).status).toBe(404)
    expect((await req(b.cookie, 'DELETE', `/v1/chat/sessions/${id}`)).status).toBe(404)
    expect((await send(b.cookie, id, '你好')).status).toBe(404)
    // 對話仍在、沒有寫入訊息，也沒有用掉 b 的次數
    expect(await t.db.select().from(chatSessions)).toHaveLength(1)
    expect(await t.db.select().from(chatMessages)).toHaveLength(0)
    expect(await t.db.select().from(chatUsage)).toHaveLength(0)
  })

  it('不是家庭成員時家庭模式 403', async () => {
    const a = await login('a@example.com')
    const [fam] = await t.db.insert(families).values({ name: '別人家' }).returning()
    const id = await newSession(a.cookie)
    expect((await send(a.cookie, id, '育兒', { familyId: fam!.id })).status).toBe(403)
  })

  it('訊息格式：空白、過長、多餘欄位 400', async () => {
    const a = await login()
    const id = await newSession(a.cookie)
    expect((await send(a.cookie, id, '   ')).status).toBe(400)
    expect((await send(a.cookie, id, '字'.repeat(501))).status).toBe(400)
    expect((await send(a.cookie, id, '你好', { role: 'admin' })).status).toBe(400)
  })
})

describe('一則訊息', () => {
  it('SSE 依序 sources → delta → done；引用換成福利 id、清單外的移除；存下訊息、標題與條件；用量記為 chat', async () => {
    const { birth } = await seedPrograms()
    const fake = useLLM(new FakeLLM({ stream: ['可以申請生育補助[', '[1]]，也可以看[[9]]。'], recorder: dbUsageRecorder(t.db) }))
    const a = await login('a@example.com', { city: '彰化縣', name: '王小明', birthday: '1990-01-01' })
    const id = await newSession(a.cookie)

    const { events } = await send(a.cookie, id, '生小孩有補助嗎')
    expect(events.map((e) => e.event)).toEqual(['sources', 'delta', 'delta', 'done'])
    const sources = events[0]!.data.sources as Json[]
    expect(sources[0].id).toBe(birth.id)
    expect(sources.every((s) => s.city === '彰化縣')).toBe(true) // 沒提到縣市 → 居住縣市
    expect(sources.some((s) => s.name === '已過期的生育補助')).toBe(false)
    expect(sources[0].match.light).toBe('GREEN')
    const d = done(events)
    expect(d.mode).toBe('llm')
    expect(d.content).toBe(`可以申請生育補助[[${birth.id}]]，也可以看。`)

    // prompt 不含姓名、email、生日
    const system = fake.lastStream!.system
    expect(system).not.toContain('王小明')
    expect(system).not.toContain('a@example.com')
    expect(system).not.toContain('1990')

    const detail = ((await (await req(a.cookie, 'GET', `/v1/chat/sessions/${id}`)).json()) as Json).data
    expect(detail.title).toBe('生小孩有補助嗎')
    expect(detail.messages.map((m: Json) => [m.role, m.mode])).toEqual([['user', null], ['assistant', 'llm']])
    expect(detail.messages[1].sources[0].id).toBe(birth.id)
    const [s] = await t.db.select().from(chatSessions)
    expect(s!.filters).toMatchObject({ cities: ['彰化縣'], topic: '生小孩有補助嗎' })
    const calls = await t.db.select().from(llmCalls)
    expect(calls.map((c) => c.purpose).sort()).toEqual(['chat', 'chat']) // 問題的 embedding ＋ 回答
  })

  it('追問沿用上一輪的主題與條件；歷史訊息帶進 prompt（拿掉引用）', async () => {
    const { taipei } = await seedPrograms()
    const fake = useLLM(new FakeLLM({ stream: ['好的[[1]]'] }))
    const a = await login('a@example.com', { city: '彰化縣' })
    const id = await newSession(a.cookie)
    await send(a.cookie, id, '生育補助')
    const { events } = await send(a.cookie, id, '那臺北呢')
    expect(events[0]!.data.sources.map((s: Json) => s.id)).toEqual([taipei.id])
    expect(fake.lastStream!.messages).toEqual([
      { role: 'user', content: '生育補助' },
      { role: 'assistant', content: '好的' },
      { role: 'user', content: '那臺北呢' },
    ])
  })

  it('不套用個人資料：沒有燈號、不用居住縣市', async () => {
    await seedPrograms()
    useLLM(new FakeLLM())
    const a = await login('a@example.com', { city: '彰化縣' })
    const id = await newSession(a.cookie)
    const { events } = await send(a.cookie, id, '生育補助', { useProfile: false })
    const sources = events[0]!.data.sources as Json[]
    expect(sources.every((s) => s.match === null)).toBe(true)
    expect(new Set(sources.map((s) => s.city))).toEqual(new Set(['彰化縣', '臺北市']))
  })

  it('家庭模式附上家人的燈號', async () => {
    await seedPrograms()
    useLLM(new FakeLLM())
    const a = await login('a@example.com', { city: '彰化縣' })
    const b = await login('b@example.com', { identities: ['身心障礙者'] })
    const [fam] = await t.db.insert(families).values({ name: '我家', createdBy: a.id }).returning()
    await t.db.insert(familyMembers).values([{ familyId: fam!.id, userId: a.id, role: 'admin' }, { familyId: fam!.id, userId: b.id }])
    const id = await newSession(a.cookie)
    const { events } = await send(a.cookie, id, '身障生育', { familyId: fam!.id })
    const s = (events[0]!.data.sources as Json[]).find((x) => x.name === '身心障礙者生育輔導')
    expect(s.match.light).toBe('RED')
    expect(s.familyMatches[0].match.light).toBe('GREEN')
    const [row] = await t.db.select().from(chatSessions)
    expect(row!.familyId).toBe(fam!.id)
  })

  it('居住縣市還沒有資料時改列其他縣市，並告訴 LLM', async () => {
    await seedPrograms()
    const fake = useLLM(new FakeLLM())
    const a = await login('a@example.com', { city: '連江縣' })
    const id = await newSession(a.cookie)
    const { events } = await send(a.cookie, id, '生育補助')
    expect(events[0]!.data.sources.length).toBeGreaterThan(0)
    expect(fake.lastStream!.system).toContain('目前還沒有收錄資料')
  })
})

describe('LLM 不可用時退回固定格式', () => {
  it.each([
    ['沒有 LLM（規則模式）', () => useLLM(null)],
    ['額度不足暫停中', async () => {
      useLLM(new FakeLLM())
      await t.db.insert(llmPause).values({ name: 'welfare-structure', reason: 'quota' })
    }],
    ['串流到一半失敗', () => useLLM(new FakeLLM({ stream: ['哞', '～'], streamFailAfter: 1, streamError: new LLMError('timeout', 'timeout') }))],
  ])('%s', async (_name, setup) => {
    const { birth } = await seedPrograms()
    await setup()
    const a = await login('a@example.com', { city: '彰化縣' })
    const id = await newSession(a.cookie)
    const { events } = await send(a.cookie, id, '生育補助')
    const d = done(events)
    expect(d.mode).toBe('fallback')
    expect(d.content).toContain('AI 暫時無法回覆')
    expect(d.content).toContain(`[[${birth.id}]]`)
    const [m] = await t.db.select().from(chatMessages).where(eq(chatMessages.role, 'assistant'))
    expect(m!.metadata.mode).toBe('fallback')
  })

  it('沒有找到任何福利時不呼叫 LLM', async () => {
    const fake = useLLM(new FakeLLM())
    const a = await login()
    const id = await newSession(a.cookie)
    const { events } = await send(a.cookie, id, '生育補助')
    expect(events[0]!.data.sources).toEqual([])
    expect(done(events).content).toContain('目前沒有找到相關的福利')
    expect(fake.lastStream).toBeNull()
  })
})

describe('每日次數', () => {
  it(`每人每日 ${DAILY_LIMIT} 則，超過 429；列表附上已用次數；刪除對話不會歸零`, async () => {
    useLLM(null)
    const a = await login()
    const id = await newSession(a.cookie)
    await send(a.cookie, id, '你好')
    let list = (await (await req(a.cookie, 'GET', '/v1/chat/sessions')).json()) as Json
    expect(list.meta.quota).toEqual({ limit: DAILY_LIMIT, used: 1 })

    await t.db.update(chatUsage).set({ count: DAILY_LIMIT - 1 })
    expect((await send(a.cookie, id, '第 30 則')).status).toBe(200)
    const over = await send(a.cookie, id, '第 31 則')
    expect(over.status).toBe(429)
    expect(over.body.error.code).toBe('rate_limited')

    expect((await req(a.cookie, 'DELETE', `/v1/chat/sessions/${id}`)).status).toBe(204)
    list = (await (await req(a.cookie, 'GET', '/v1/chat/sessions')).json()) as Json
    expect(list.data).toEqual([])
    expect(list.meta.quota.used).toBe(DAILY_LIMIT)
  })

  it('同時送出也不會超過上限', async () => {
    useLLM(null)
    const a = await login()
    const id = await newSession(a.cookie)
    await t.db.insert(chatUsage).values({ userId: a.id, day: taipeiDay(new Date()), count: DAILY_LIMIT - 2 })
    const results = await Promise.all(Array.from({ length: 5 }, () => send(a.cookie, id, '你好')))
    expect(results.filter((r) => r.status === 200)).toHaveLength(2)
    const [row] = await t.db.select().from(chatUsage)
    expect(row!.count).toBe(DAILY_LIMIT)
  })

  it('以臺北時間換日', () => {
    expect(taipeiDay(new Date('2026-11-23T15:59:59Z'))).toBe('2026-11-23')
    expect(taipeiDay(new Date('2026-11-23T16:00:00Z'))).toBe('2026-11-24')
  })
})
