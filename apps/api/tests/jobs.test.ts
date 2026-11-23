// 背景工作在 API 程序內啟動（WORKER_MODE=inline）：pg-boss 能啟動、寫入心跳、正常停止；LLM 額度不足時暫停與恢復。
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { llmPause, workerHeartbeat } from '../src/db/schema/index.ts'
import { LLMStructurer, RuleStructurer } from '../src/features/welfare/structure.ts'
import { HEARTBEAT_NAME, startJobs } from '../src/jobs/index.ts'
import { sign } from '../src/lib/hmac.ts'
import { type LLM, toLLMError } from '../src/lib/llm/index.ts'
import { MemoryMailer } from '../src/lib/mail/index.ts'
import { createBoss } from '../src/lib/queue.ts'
import { resetDb, setupApp } from './helpers.ts'

const t = setupApp()
const bossP = createBoss(t.env.DATABASE_URL)
afterAll(async () => {
  await (await bossP).stop({ graceful: false })
  await t.close()
})
const start = async (heartbeatMs?: number) =>
  startJobs({ db: t.db, boss: await bossP, structurer: new RuleStructurer(), llm: null, ...(heartbeatMs ? { heartbeatMs } : {}) })

describe('startJobs', () => {
  it('啟動後立即寫入心跳，之後定期更新，並能正常停止', async () => {
    await resetDb(t.db)
    const jobs = await start(200)
    try {
      const first = await t.db.select().from(workerHeartbeat).where(eq(workerHeartbeat.name, HEARTBEAT_NAME))
      expect(first).toHaveLength(1)
      await new Promise((r) => setTimeout(r, 500))
      const [later] = await t.db.select().from(workerHeartbeat).where(eq(workerHeartbeat.name, HEARTBEAT_NAME))
      expect(later!.beatAt.getTime()).toBeGreaterThan(first[0]!.beatAt.getTime())
    } finally {
      await jobs.stop()
    }
  })

  it('/health 在心跳正常時回報 ok', async () => {
    const jobs = await start()
    try {
      const body = (await (await t.app.request('/health')).json()) as { status: string }
      expect(body.status).toBe('ok')
    } finally {
      await jobs.stop()
    }
  })
})

describe('LLM 額度不足：暫停、探測、恢復（docs/backend.md §8.4.1）', () => {
  // 可切換的 LLM：quota=true 時所有呼叫都回 402
  const state = { quota: true }
  const llm: LLM = {
    model: 'fake-quota',
    async generate<T>(o: { schema: { parse: (v: unknown) => T } }) {
      if (state.quota) throw toLLMError(Object.assign(new Error('{"error":{"code":402,"status":"RESOURCE_EXHAUSTED"}}'), { status: 402 }))
      return o.schema.parse({ ok: true })
    },
    async *stream() {},
    async embed(texts: string[]) {
      return texts.map(() => Array.from({ length: 768 }, () => 0.1))
    },
  } as LLM
  const mailer = new MemoryMailer()
  const waitFor = async (fn: () => Promise<boolean>, ms = 15_000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await fn()) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('timeout')
  }
  const paused = async () => (await t.db.select().from(llmPause)).length > 0
  const ingest = () => {
    const body = JSON.stringify({
      source: { site_id: 'kinmen', city: '金門縣', url: 'https://social.kinmen.gov.tw/cp.aspx?n=Q', kind: 'cms' },
      program_key: 'kinmen:急難救助',
      title: '急難救助',
      published_at: '2024-02-22',
      content_md: '設籍本縣，因遭逢急難致生活陷於困境者，得申請急難救助。'.repeat(4),
      attachments: [],
      structured: {},
      classification: { type: 'program', confidence: 0.9 },
      content_hash: `sha256:${'b'.repeat(64)}`,
    })
    const ts = Math.floor(Date.now() / 1000)
    return t.app.request('/internal/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mou-timestamp': String(ts), 'x-mou-signature': sign(t.env.INGEST_HMAC_KEY, ts, body) },
      body,
    })
  }

  it('分辨額度錯誤', () => {
    expect(toLLMError(Object.assign(new Error('x'), { status: 402 })).kind).toBe('quota')
    expect(toLLMError(new Error('got status: 429 {"error":{"status":"RESOURCE_EXHAUSTED"}}')).kind).toBe('quota')
    expect(toLLMError(new Error('request aborted')).kind).toBe('timeout')
    expect(toLLMError(Object.assign(new Error('bad'), { status: 500 })).kind).toBe('provider')
  })

  it('結構化遇到 402 → 暫停並通知一次；/health 顯示暫停；探測成功後自動恢復並通知', async () => {
    await resetDb(t.db)
    mailer.sent.length = 0
    state.quota = true
    const res = await ingest()
    expect(res.status, await res.clone().text()).toBe(200)
    const jobs = await startJobs({
      db: t.db,
      boss: await bossP,
      structurer: new LLMStructurer(llm),
      llm,
      mailer,
      alertTo: 'admin@example.com',
      probeMs: 300,
    })
    try {
      await waitFor(paused)
      expect(mailer.sent.map((m) => m.subject)).toEqual(['【哞福利】Gemini 額度不足，福利結構化已暫停'])
      const health = (await (await t.app.request('/health')).json()) as { status: string; llm: { paused: boolean } }
      expect(health.llm.paused).toBe(true)
      expect(health.status).toBe('ok') // 暫停不影響部署的煙霧測試

      // 仍然沒有額度：探測失敗，維持暫停，不重複通知
      await new Promise((r) => setTimeout(r, 800))
      expect(await paused()).toBe(true)
      expect(mailer.sent).toHaveLength(1)

      state.quota = false // 儲值
      await waitFor(async () => !(await paused()))
      await waitFor(async () => mailer.sent.length === 2)
      expect(mailer.last()!.subject).toBe('【哞福利】Gemini 已恢復，福利結構化繼續進行')
    } finally {
      await jobs.stop()
    }
  })

  it('重啟時仍在暫停：不取工作，立刻探測，成功就恢復', async () => {
    await resetDb(t.db)
    mailer.sent.length = 0
    state.quota = false
    await t.db.insert(llmPause).values({ name: 'welfare-structure', reason: '402' })
    const jobs = await startJobs({ db: t.db, boss: await bossP, structurer: new LLMStructurer(llm), llm, mailer, alertTo: 'admin@example.com' })
    try {
      await waitFor(async () => !(await paused()) && mailer.sent.length === 1)
      expect(mailer.last()!.subject).toContain('已恢復')
    } finally {
      await jobs.stop()
    }
  })
})
