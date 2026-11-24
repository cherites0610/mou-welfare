// LINE Bot（docs/backend.md §8.7）：webhook 簽章、事件排入佇列、事件處理（FakeLineBot、FakeLLM，不連 LINE 與 Gemini）
import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { account, chatMessages, chatSessions, chatUsage, user } from '../src/db/schema/index.ts'
import { DAILY_LIMIT, taipeiDay } from '../src/features/chat/service.ts'
import { toLineText } from '../src/features/line/format.ts'
import { handleLineEvent, type LineContext, type LineEvent, SESSION_IDLE_MS } from '../src/features/line/service.ts'
import { FakeLineBot, verifyLineSignature } from '../src/lib/line.ts'
import { FakeLLM } from '../src/lib/llm/index.ts'
import { createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const SECRET = 'line-bot-channel-secret-for-tests'
const t = setupApp({ LINE_BOT_CHANNEL_SECRET: SECRET, LINE_BOT_ACCESS_TOKEN: 'token', LINE_LIFF_ID: '1234-abcd' })
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  t.queue.jobs.length = 0
})

const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64')

function webhook(body: string, signature?: string) {
  return t.app.request('/v1/line/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'x-line-signature': signature } : {}) },
    body,
  })
}

const textEvent = (text: string, userId = 'U-line-1', extra: Partial<LineEvent> = {}): LineEvent => ({
  type: 'message',
  mode: 'active',
  webhookEventId: `ev-${Math.random()}`,
  replyToken: 'reply-token',
  source: { type: 'user', userId },
  message: { type: 'text', text },
  ...extra,
})

function ctx(llm: FakeLLM | null = null, now?: Date): LineContext & { line: FakeLineBot } {
  return { db: t.db, llm, line: new FakeLineBot(), env: t.env, ...(now ? { now } : {}) }
}

/** 用 LINE 登入過的使用者（account 的 accountId＝LINE 使用者 ID） */
async function linked(lineUserId = 'U-line-1', profile: Record<string, unknown> = {}) {
  await signUp(t, 'line-user@example.com')
  const [u] = await t.db.select().from(user).where(eq(user.email, 'line-user@example.com'))
  if (Object.keys(profile).length) await t.db.update(user).set(profile).where(eq(user.id, u!.id))
  await t.db.insert(account).values({ id: `acc-${lineUserId}`, accountId: lineUserId, providerId: 'line', userId: u!.id })
  return u!.id
}

const texts = (line: FakeLineBot) => line.sent.flatMap((s) => s.messages.filter((m) => m.type === 'text').map((m) => (m as { text: string }).text))
const flexes = (line: FakeLineBot) => line.sent.flatMap((s) => s.messages.filter((m) => m.type === 'flex')) as Json[]

describe('webhook', () => {
  const body = JSON.stringify({ destination: 'U-bot', events: [textEvent('臺北的育兒津貼', 'U-line-1', { webhookEventId: 'ev-1' })] })

  it('簽章正確：事件排入佇列，立即回 200', async () => {
    const res = await webhook(body, sign(body))
    expect(res.status).toBe(200)
    expect(t.queue.jobs).toEqual([{ name: 'line-event', data: { webhookEventId: 'ev-1', event: JSON.parse(body).events[0] } }])
  })

  it('沒有簽章、簽章錯誤、內容被改過 → 401，不排入佇列', async () => {
    expect((await webhook(body)).status).toBe(401)
    expect((await webhook(body, sign(body, 'other-secret'))).status).toBe(401)
    expect((await webhook(body.replace('臺北', '臺中'), sign(body))).status).toBe(401)
    expect(t.queue.jobs).toHaveLength(0)
  })

  it('LINE 設定 webhook 時的驗證請求（沒有事件）回 200', async () => {
    const empty = JSON.stringify({ destination: 'U-bot', events: [] })
    expect((await webhook(empty, sign(empty))).status).toBe(200)
    expect(t.queue.jobs).toHaveLength(0)
  })

  it('沒有設定 channel secret 時一律 401', async () => {
    const other = setupApp()
    try {
      expect((await other.app.request('/v1/line/webhook', { method: 'POST', headers: { 'x-line-signature': sign(body) }, body })).status).toBe(401)
    } finally {
      await other.close()
    }
  })

  it('verifyLineSignature：長度不同或不是 base64 也安全地回 false', () => {
    const raw = new TextEncoder().encode('x')
    expect(verifyLineSignature(SECRET, raw, sign('x'))).toBe(true)
    expect(verifyLineSignature(SECRET, raw, 'abc')).toBe(false)
    expect(verifyLineSignature(SECRET, raw, undefined)).toBe(false)
  })
})

describe('已用 LINE 登入的使用者', () => {
  it('交給聊天服務回答：文字＋福利卡片，引用換成卡片編號，和網站共用次數', async () => {
    const userId = await linked('U-line-1', { city: '彰化縣' })
    const p = await createProgram(t.db, { city: '彰化縣', name: '彰化縣生育補助', summary: '新生兒每胎補助', categories: ['婦女與幼兒福利'] })
    const c = ctx(new FakeLLM({ stream: ['可以申請**生育補助**', '[[1]]，每胎都有。'] }))

    expect(await handleLineEvent(c, textEvent('生小孩有補助嗎'))).toBe('answered')
    expect(c.line.loadings).toEqual(['U-line-1'])
    expect(c.line.sent).toHaveLength(1)
    expect(c.line.sent[0]!.via).toBe('reply')
    expect(texts(c.line)).toEqual(['可以申請生育補助[1]，每胎都有。'])
    const [cards] = flexes(c.line)
    expect(cards.contents.type).toBe('carousel')
    expect(cards.contents.contents[0].footer.contents[0].action.uri).toBe(`https://mou-welfare.com/welfares/${p.id}`)

    // 對話存成 LINE 的對話，網站的歷史對話也看得到；次數和網站共用
    const [s] = await t.db.select().from(chatSessions)
    expect(s).toMatchObject({ userId, channel: 'line', title: '生小孩有補助嗎' })
    expect(await t.db.select().from(chatMessages)).toHaveLength(2)
    expect((await t.db.select().from(chatUsage))[0]).toMatchObject({ userId, count: 1 })
  })

  it('套用個人資料：居住縣市當作篩選、卡片顯示燈號', async () => {
    await linked('U-line-1', { city: '彰化縣', birthday: '1950-01-01' })
    await createProgram(t.db, { city: '彰化縣', name: '彰化縣老人假牙補助', summary: '長者假牙', identities: ['65歲以上'] })
    await createProgram(t.db, { city: '臺北市', name: '臺北市老人假牙補助', summary: '長者假牙', identities: ['65歲以上'] })
    const c = ctx(new FakeLLM({ stream: ['好的'] }))
    await handleLineEvent(c, textEvent('假牙補助'))
    const bubbles = flexes(c.line)[0].contents.contents as Json[]
    expect(bubbles.map((b) => b.body.contents[0].text)).toEqual(['1. 彰化縣老人假牙補助'])
    expect(bubbles[0].body.contents.some((x: Json) => x.text === '● 可能符合')).toBe(true)
  })

  it('追問沿用同一段對話；隔太久就開新的', async () => {
    await linked()
    await createProgram(t.db, { city: '臺北市', name: '臺北市育兒津貼', summary: '育兒' })
    const start = new Date('2026-11-24T02:00:00Z')
    const llm = new FakeLLM({ stream: ['好'] })
    await handleLineEvent(ctx(llm, start), textEvent('臺北的育兒津貼'))
    await handleLineEvent(ctx(llm, new Date(start.getTime() + 60_000)), textEvent('那新北呢'))
    expect(await t.db.select().from(chatSessions)).toHaveLength(1)
    await t.db.update(chatSessions).set({ updatedAt: new Date(Date.now() - SESSION_IDLE_MS - 1000) })
    await handleLineEvent(ctx(llm), textEvent('老人福利'))
    expect(await t.db.select().from(chatSessions)).toHaveLength(2)
  })

  it('今天的次數用完：回覆提示，不呼叫 LLM', async () => {
    const userId = await linked()
    const now = new Date()
    await t.db.insert(chatUsage).values({ userId, day: taipeiDay(now), count: DAILY_LIMIT })
    const llm = new FakeLLM({ stream: ['不該出現'] })
    const c = ctx(llm, now)
    expect(await handleLineEvent(c, textEvent('育兒津貼'))).toBe('limited')
    expect(texts(c.line)[0]).toContain(`${DAILY_LIMIT} 則已經用完`)
    expect(llm.lastStream).toBeNull()
    expect(await t.db.select().from(chatMessages)).toHaveLength(0)
  })

  it('reply token 過期時改用 push', async () => {
    await linked()
    const c = ctx(new FakeLLM({ stream: ['好'] }))
    c.line.replyFails = true
    await handleLineEvent(c, textEvent('育兒津貼'))
    expect(c.line.sent.map((s) => [s.via, s.to])).toEqual([['push', 'U-line-1']])
  })
})

describe('還沒登入的使用者', () => {
  it('不呼叫 LLM、不寫入對話：列出福利卡片，附上 LIFF 登入按鈕', async () => {
    await createProgram(t.db, { city: '臺北市', name: '臺北市育兒津貼', summary: '每月補助' })
    const llm = new FakeLLM({ stream: ['不該出現'] })
    const c = ctx(llm)
    expect(await handleLineEvent(c, textEvent('臺北的育兒津貼', 'U-stranger'))).toBe('guest')
    expect(llm.lastStream).toBeNull()
    expect(texts(c.line)[0]).toContain('1. 臺北市育兒津貼（臺北市）')
    const [cards, login] = flexes(c.line)
    expect(cards.contents.contents).toHaveLength(1)
    expect(login.contents.footer.contents[0].action.uri).toBe('https://liff.line.me/1234-abcd')
    expect(await t.db.select().from(chatSessions)).toHaveLength(0)
    expect(await t.db.select().from(chatUsage)).toHaveLength(0)
  })

  it('沒有找到福利：回覆沒有結果，仍附登入按鈕', async () => {
    const c = ctx()
    await handleLineEvent(c, textEvent('火星的補助', 'U-stranger'))
    expect(texts(c.line)[0]).toContain('目前沒有找到相關的福利')
    expect(flexes(c.line)).toHaveLength(1)
  })

  it('另一個 LINE 使用者 ID 不會被當成已登入的人', async () => {
    await linked('U-line-1')
    const c = ctx(new FakeLLM({ stream: ['好'] }))
    expect(await handleLineEvent(c, textEvent('育兒津貼', 'U-line-2'))).toBe('guest')
  })
})

describe('其他事件', () => {
  it('加入好友：打招呼；還沒登入的附上登入按鈕', async () => {
    const c = ctx()
    expect(await handleLineEvent(c, { type: 'follow', replyToken: 'r', source: { type: 'user', userId: 'U-new' } })).toBe('welcomed')
    expect(texts(c.line)[0]).toContain('我是阿哞')
    expect(flexes(c.line)).toHaveLength(1)

    await linked('U-linked')
    const c2 = ctx()
    await handleLineEvent(c2, { type: 'follow', replyToken: 'r', source: { type: 'user', userId: 'U-linked' } })
    expect(flexes(c2.line)).toHaveLength(0)
  })

  it('貼圖、圖片：請使用者改用文字', async () => {
    const c = ctx()
    const event = { ...textEvent(''), message: { type: 'sticker' } }
    expect(await handleLineEvent(c, event)).toBe('unsupported')
    expect(texts(c.line)[0]).toContain('只看得懂文字')
  })

  it('群組、聊天室、standby 與其他事件都不回覆', async () => {
    const c = ctx()
    expect(await handleLineEvent(c, textEvent('育兒', 'U-1', { source: { type: 'group', userId: 'U-1' } }))).toBe('skipped')
    expect(await handleLineEvent(c, textEvent('育兒', 'U-1', { mode: 'standby' }))).toBe('skipped')
    expect(await handleLineEvent(c, { type: 'unfollow', source: { type: 'user', userId: 'U-1' } })).toBe('skipped')
    expect(c.line.sent).toHaveLength(0)
  })
})

describe('toLineText', () => {
  const src = (id: string) => ({ id }) as Json
  const a = 'aaaaaaaa-0000-0000-0000-000000000001'
  const b = 'aaaaaaaa-0000-0000-0000-000000000002'

  it('Markdown 轉成純文字，引用換成卡片編號，清單外的拿掉', () => {
    const md = `## 可以申請\n\n- **生育補助** [[${b}]]\n- 育兒津貼 [[${a}]]\n- 其他 [[aaaaaaaa-0000-0000-0000-000000000009]]\n\n\n\n詳見[官網](https://example.gov.tw)`
    expect(toLineText(md, [src(a), src(b)])).toBe('可以申請\n\n・生育補助 [2]\n・育兒津貼 [1]\n・其他 \n\n詳見官網 https://example.gov.tw')
  })

  it('超過 LINE 的長度上限時截斷', () => {
    expect([...toLineText('字'.repeat(6000), [])].length).toBe(4900)
  })
})
