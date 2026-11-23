// 爬蟲執行紀錄：爬蟲回報（HMAC）與管理後台查詢（admin）。docs/admin.md §4.6
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { Hono } from 'hono'
import type { AppEnv } from '../../app.ts'
import { ApiError, apiError } from '../../lib/errors.ts'
import { createNotify } from '../../lib/notify.ts'
import { ScrapeRunPayload } from './schema.ts'
import { getRun, reportRun, runReportText, scraperStatus } from './service.ts'

// 簽章驗證時已讀過 body；HonoRequest 會快取（同 ingest/routes.ts）
async function readJson(req: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

export const scraperInternalRoutes = new Hono<AppEnv>().post('/internal/scrape-runs', async (c) => {
  const parsed = ScrapeRunPayload.safeParse(await readJson(c.req))
  if (!parsed.success) return apiError(c, 400, 'invalid_request', '回報格式錯誤', { issues: parsed.error.issues })
  const { db, mailer, env } = c.var.deps
  const { run, finishedNow } = await reportRun(db, parsed.data)
  // 有站點不是 ok 時寄信；全部正常只在管理後台顯示
  if (finishedNow && run.status !== 'ok') {
    await createNotify(mailer, env.ALERT_EMAIL)(`【哞福利】爬蟲執行有異常（${run.id}）`, runReportText(run)).catch((e) =>
      console.error('[scraper] notify failed', e),
    )
  }
  return c.json({ data: { id: run.id, status: run.status } }, 200)
})

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { 'application/json': { schema } } })
const err = (d: string) => json(ErrorSchema, d)
const tags = ['admin']
const common = { 401: err('未登入'), 403: err('不是管理者') }
const ts = z.string().nullable()

const Health = z.enum(['ok', 'degraded', 'blocked', 'failed'])
const SiteCounts = {
  siteId: z.string(), city: z.string().nullable(), seen: z.number(), new: z.number(), updated: z.number(), unchanged: z.number(),
  removed: z.number(), filtered: z.number(), quarantined: z.number(), pushed: z.number(), pushFailed: z.number(), pages: z.number(),
  health: Health, healthDetail: z.string(), errorCount: z.number(), startedAt: z.string(), finishedAt: z.string(),
}
const SiteResult = z.object({
  ...SiteCounts,
  errors: z.array(z.string()),
  quarantine: z.array(z.object({ title: z.string(), url: z.string(), issues: z.array(z.string()) })),
})
const RunSummary = z.object({
  id: z.string(), trigger: z.string(), status: z.string(), startedAt: z.string(), finishedAt: ts, updatedAt: z.string(),
  planned: z.number(), done: z.number(), current: z.string().nullable(),
  totals: z.object({
    seen: z.number(), new: z.number(), updated: z.number(), removed: z.number(), pushed: z.number(), quarantined: z.number(),
    errors: z.number(), notOk: z.number(),
  }),
})
const Status = z
  .object({
    intervalDays: z.number(), nextDueAt: ts, overdue: z.boolean(), latest: RunSummary.nullable(), runs: z.array(RunSummary),
    sites: z.array(z.object({
      siteId: z.string(), city: z.string().nullable(), runId: z.string().nullable(), last: z.object(SiteCounts).nullable(),
      lastOkAt: ts, programs: z.object({ active: z.number(), total: z.number() }),
    })),
  })
  .openapi('AdminScraperStatus')
const RunDetail = RunSummary.extend({ intervalDays: z.number().nullable(), plannedSites: z.array(z.string()), sites: z.array(SiteResult) }).openapi(
  'AdminScraperRun',
)

const routes = {
  status: createRoute({ method: 'get', path: '/v1/admin/scraper', tags, summary: '爬蟲排程狀態、最近的執行與各站結果',
    responses: { 200: json(z.object({ data: Status }), '狀態'), ...common } }),
  run: createRoute({ method: 'get', path: '/v1/admin/scraper/runs/{id}', tags, summary: '單次執行的各站結果（含錯誤與隔離清單）',
    request: { params: z.object({ id: z.string().regex(/^\d{8}-\d{6}$/) }) },
    responses: { 200: json(z.object({ data: RunDetail }), '執行'), ...common, 404: err('不存在') } }),
}

export const scraperAdminRoutes = new OpenAPIHono<AppEnv>()
  .openapi(routes.status, async (c) => c.json({ data: await scraperStatus(c.var.deps.db) }, 200))
  .openapi(routes.run, async (c) => {
    const run = await getRun(c.var.deps.db, c.req.valid('param').id)
    if (!run) throw new ApiError(404, 'not_found', '找不到這次執行')
    return c.json({ data: run }, 200)
  })
