import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { faqs, workerHeartbeat } from '../src/db/schema/index.ts'
import { createAuth } from '../src/lib/auth.ts'
import { MemoryMailer } from '../src/lib/mail/index.ts'
import { MemoryQueue } from '../src/lib/queue.ts'
import { FakeLLM } from '../src/lib/llm/index.ts'
import { z } from 'zod'
import { resetDb, setupApp, signUp } from './helpers.ts'
import { testEnv } from './test-env.ts'

// 測試中直接讀取回應內容
type Json = any
const json = async (res: Response): Promise<Json> => res.json()

const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

describe('GET /health', () => {
  it('資料庫正常、已套用 migration；沒有背景工作心跳時為 degraded', async () => {
    const res = await t.app.request('/health')
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body).toMatchObject({ status: 'degraded', db: 'ok', jobs: { mode: 'inline', lastBeatSecondsAgo: null } })
    expect(body.migration).toBeTruthy()
  })

  it('有新的背景工作心跳時為 ok', async () => {
    await t.db.insert(workerHeartbeat).values({ name: 'jobs' })
    const body = await json(await t.app.request('/health'))
    expect(body.status).toBe('ok')
  })

  it('WORKER_MODE=off 時不檢查心跳', async () => {
    const off = setupApp({ WORKER_MODE: 'off' })
    const body = await json(await off.app.request('/health'))
    expect(body).toMatchObject({ status: 'ok', jobs: { mode: 'off' } })
    await off.close()
  })

  it('資料庫無法連線時回傳 503', async () => {
    const env = testEnv({ DATABASE_URL: 'postgresql://nobody:x@127.0.0.1:1/none' })
    const { db, sql } = createDb(env.DATABASE_URL, { max: 1 })
    const mailer = new MemoryMailer()
    const app = createApp({ db, auth: createAuth(db, env, mailer), env, mailer, storage: null, queue: new MemoryQueue() })
    const res = await app.request('/health')
    expect(res.status).toBe(503)
    await sql.end()
  })
})

describe('GET /v1/faq', () => {
  it('只回傳已發布的 FAQ，依 sort 排序', async () => {
    await t.db.insert(faqs).values([
      { question: '第二題', answer: 'B', sort: 2 },
      { question: '未發布', answer: 'X', sort: 0, published: false },
      { question: '第一題', answer: 'A', sort: 1 },
    ])
    const body = await json(await t.app.request('/v1/faq'))
    expect(body.data.map((f: { question: string }) => f.question)).toEqual(['第一題', '第二題'])
  })
})

describe('GET /v1/me', () => {
  it('回傳登入使用者，身分預設為空陣列', async () => {
    const { cookie } = await signUp(t, 'me@example.com')
    const body = await json(await t.app.request('/v1/me', { headers: { cookie } }))
    expect(body.data).toMatchObject({ email: 'me@example.com', name: '測試使用者', identities: [], birthday: null })
    expect(body.data.isSubscribed).toBe(false)
    expect(new Date(body.data.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('可以開關訂閱通知', async () => {
    const { cookie } = await signUp(t, 'me@example.com')
    const headers = { cookie, 'content-type': 'application/json' }
    const res = await t.app.request('/v1/me', { method: 'PATCH', headers, body: JSON.stringify({ isSubscribed: true }) })
    expect((await json(res)).data.isSubscribed).toBe(true)
    expect((await json(await t.app.request('/v1/me', { headers: { cookie } }))).data.isSubscribed).toBe(true)
  })
})

describe('錯誤格式', () => {
  it('404 為統一格式', async () => {
    const { cookie } = await signUp(t)
    const res = await t.app.request('/v1/nope', { headers: { cookie } })
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: '找不到資源' } })
  })
})

describe('FakeLLM', () => {
  it('回傳值不符 schema 時丟出 schema 錯誤', async () => {
    const llm = new FakeLLM({ generate: () => ({ wrong: true }) })
    await expect(llm.generate({ system: '', input: 'x', schema: z.object({ ok: z.boolean() }) })).rejects.toMatchObject({
      kind: 'schema',
    })
  })
  it('embedding 維度為 768', async () => {
    const [v] = await new FakeLLM().embed(['福利'])
    expect(v).toHaveLength(768)
  })
})
