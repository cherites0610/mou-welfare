// 爬蟲執行紀錄與系統檢查（docs/admin.md §4.6、docs/backend.md §8.4.2）
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { alertState, scrapeRuns, user } from '../src/db/schema/index.ts'
import { runMonitor } from '../src/jobs/monitor.ts'
import { sign } from '../src/lib/hmac.ts'
import { createNotify } from '../src/lib/notify.ts'
import { createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const ALERT = 'ops@example.com'
const t = setupApp({ ALERT_EMAIL: ALERT })
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  t.mailer.sent.length = 0
})

const KEY = t.env.INGEST_HMAC_KEY
function report(payload: unknown, key = KEY) {
  const body = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000)
  return t.app.request('/internal/scrape-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mou-timestamp': String(ts), 'x-mou-signature': sign(key, ts, body) },
    body,
  })
}

const site = (siteId: string, over: Record<string, unknown> = {}) => ({
  site_id: siteId, city: '金門縣', seen: 10, new: 1, updated: 2, unchanged: 7, removed: 0, filtered: 1, quarantined: 0,
  pushed: 3, push_failed: 0, pages: 12, health: 'ok', health_detail: '', errors: [], error_count: 0, quarantine: [],
  started_at: '2026-11-20T02:00:00+08:00', finished_at: '2026-11-20T02:15:00+08:00', ...over,
})
const run = (over: Record<string, unknown> = {}) => ({
  run_id: '20261120-020000', trigger: 'schedule', interval_days: 3, started_at: '2026-11-20T02:00:00+08:00',
  finished: false, planned: ['kinmen', 'klcg'], current: 'kinmen', sites: [], ...over,
})

async function admin() {
  const { cookie } = await signUp(t, 'admin@example.com')
  await t.db.update(user).set({ role: 'admin' }).where(eq(user.email, 'admin@example.com'))
  return cookie
}
const get = async (path: string, cookie: string) => {
  const res = await t.app.request(path, { headers: { cookie } })
  return { status: res.status, body: (await res.json()) as Json }
}

describe('爬蟲回報 POST /internal/scrape-runs', () => {
  it('需要 HMAC 簽章', async () => {
    const res = await t.app.request('/internal/scrape-runs', { method: 'POST', body: JSON.stringify(run()) })
    expect(res.status).toBe(401)
    expect((await report(run(), 'x'.repeat(40))).status).toBe(401)
  })

  it('格式錯誤回 400', async () => {
    expect((await report(run({ run_id: 'bad' }))).status).toBe(400)
  })

  it('開始 → 每站結束 → 全部結束；全部 ok 時不寄信', async () => {
    expect((await report(run())).status).toBe(200)
    await report(run({ current: 'klcg', sites: [site('kinmen')] }))
    let [row] = await t.db.select().from(scrapeRuns)
    expect(row).toMatchObject({ status: 'running', current: 'klcg', finishedAt: null })

    const res = await report(run({ finished: true, current: null, sites: [site('kinmen'), site('klcg', { city: '基隆市' })] }))
    expect(((await res.json()) as Json).data.status).toBe('ok')
    ;[row] = await t.db.select().from(scrapeRuns)
    expect(row!.status).toBe('ok')
    expect(row!.finishedAt).not.toBeNull()
    expect(row!.sites.map((s) => s.siteId)).toEqual(['kinmen', 'klcg'])
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('有站點不是 ok：狀態 warning 並寄信，重複回報不重寄', async () => {
    const final = run({
      finished: true,
      sites: [site('kinmen'), site('klcg', { seen: 0, health: 'blocked', health_detail: 'http_403', errors: ['list 403 https://klcg'], error_count: 1 })],
    })
    await report(final)
    await report(final)
    const [row] = await t.db.select().from(scrapeRuns)
    expect(row!.status).toBe('warning')
    expect(t.mailer.sent).toHaveLength(1)
    expect(t.mailer.sent[0]).toMatchObject({ to: ALERT, subject: '【哞福利】爬蟲執行有異常（20261120-020000）' })
    expect(t.mailer.sent[0]!.text).toContain('✗ klcg（金門縣）blocked：http_403')
    expect(t.mailer.sent[0]!.text).toContain('list 403 https://klcg')
  })
})

describe('管理後台 /v1/admin/scraper', () => {
  it('一般使用者 403', async () => {
    const { cookie } = await signUp(t, 'user@example.com')
    expect((await get('/v1/admin/scraper', cookie)).status).toBe(403)
  })

  it('各站取最近一次的結果、最近一次 ok 的時間，並附上福利數', async () => {
    await report(run({ run_id: '20261117-020000', started_at: '2026-11-17T02:00:00+08:00', finished: true,
      sites: [site('kinmen', { finished_at: '2026-11-17T02:15:00+08:00' }), site('klcg')] }))
    await report(run({ finished: true, sites: [site('kinmen', { health: 'degraded', health_detail: 'seen 3 < 50% of 10' })] }))
    await createProgram(t.db, { siteId: 'kinmen' })
    await createProgram(t.db, { siteId: 'kinmen', status: 'rejected' })
    const cookie = await admin()

    const { status, body } = await get('/v1/admin/scraper', cookie)
    expect(status).toBe(200)
    const d = body.data
    expect(d.intervalDays).toBe(3)
    expect(d.latest.id).toBe('20261120-020000')
    expect(d.runs.map((r: Json) => r.id)).toEqual(['20261120-020000', '20261117-020000'])
    const kinmen = d.sites.find((s: Json) => s.siteId === 'kinmen')
    expect(kinmen).toMatchObject({ runId: '20261120-020000', lastOkAt: '2026-11-17T02:15:00+08:00', programs: { active: 1, total: 2 } })
    expect(kinmen.last.health).toBe('degraded')
    expect(kinmen.last.errors).toBeUndefined() // 列表不帶錯誤與隔離清單（詳情才有）
    expect(d.sites.find((s: Json) => s.siteId === 'klcg').runId).toBe('20261117-020000')
  })

  it('單次執行的詳情（含錯誤與隔離清單）；不存在回 404', async () => {
    await report(run({ finished: true, sites: [site('kinmen', { quarantine: [{ title: '查無資料', url: 'https://x', issues: ['error_page'] }] })] }))
    const cookie = await admin()
    const { body } = await get('/v1/admin/scraper/runs/20261120-020000', cookie)
    expect(body.data.sites[0].quarantine).toEqual([{ title: '查無資料', url: 'https://x', issues: ['error_page'] }])
    expect(body.data.plannedSites).toEqual(['kinmen', 'klcg'])
    expect((await get('/v1/admin/scraper/runs/20990101-000000', cookie)).status).toBe(404)
  })
})

describe('系統檢查（jobs/monitor.ts）', () => {
  const notify = createNotify(t.mailer, ALERT)
  const at = (iso: string) => new Date(iso)

  it('執行中超過 4 小時沒有回報 → interrupted 並寄信一次', async () => {
    await report(run())
    await t.db.update(scrapeRuns).set({ updatedAt: at('2026-11-20T00:00:00Z') })
    await runMonitor(t.db, notify, at('2026-11-20T05:00:00Z'))
    await runMonitor(t.db, notify, at('2026-11-20T06:00:00Z'))
    const [row] = await t.db.select().from(scrapeRuns)
    expect(row!.status).toBe('interrupted')
    expect(t.mailer.sent.map((m) => m.subject)).toEqual(['【哞福利】爬蟲執行中斷（20261120-020000）'])
  })

  it('超過預定時間一天沒有新的執行 → 寄信，24 小時內不重寄；有新的執行後解除', async () => {
    await report(run({ finished: true, sites: [site('kinmen'), site('klcg')] }))
    // 11/20 02:00（臺北）開始、間隔 3 天 → 11/23 02:00 預定；11/24 02:00 後算逾期
    await runMonitor(t.db, notify, at('2026-11-23T20:00:00Z'))
    expect(t.mailer.sent).toHaveLength(1)
    expect(t.mailer.sent[0]!.subject).toBe('【哞福利】爬蟲排程逾期')
    await runMonitor(t.db, notify, at('2026-11-23T21:00:00Z'))
    expect(t.mailer.sent).toHaveLength(1)

    await report(run({ run_id: '20261124-050000', started_at: '2026-11-24T05:00:00+08:00' }))
    await runMonitor(t.db, notify, at('2026-11-23T22:00:00Z'))
    expect(await t.db.select().from(alertState).where(eq(alertState.key, 'scrape-overdue'))).toHaveLength(0)
  })

  it('還沒有任何執行時不算逾期', async () => {
    await runMonitor(t.db, notify, at('2026-11-23T20:00:00Z'))
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('結構化錯誤增加才寄信', async () => {
    await createProgram(t.db, { structureError: 'schema' })
    await runMonitor(t.db, notify)
    await runMonitor(t.db, notify)
    expect(t.mailer.sent.map((m) => m.subject)).toEqual(['【哞福利】福利結構化錯誤 1 筆'])
    await createProgram(t.db, { structureError: 'schema' })
    await runMonitor(t.db, notify)
    expect(t.mailer.sent.map((m) => m.subject)).toEqual(['【哞福利】福利結構化錯誤 1 筆', '【哞福利】福利結構化錯誤 2 筆'])
  })
})
