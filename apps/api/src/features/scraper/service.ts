// 爬蟲執行紀錄：接收回報、管理後台查詢、逾期與中斷判斷（docs/admin.md §4.6、docs/backend.md §8.4.2）
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { type ScrapeSiteResult, scrapeRuns, welfarePrograms } from '../../db/schema/index.ts'
import type { ScrapeRunPayload } from './schema.ts'

/** 預設排程間隔（爬蟲沒有回報 interval_days 時） */
export const DEFAULT_INTERVAL_DAYS = 3
/** 超過預定時間多久才算逾期（排程每天檢查一次，再加上執行時間的餘裕） */
export const OVERDUE_GRACE_MS = 24 * 3600_000
/** 執行中但這麼久沒有回報，視為中斷（單站最久約 90 分鐘） */
export const STALE_MS = 4 * 3600_000

const RECENT_RUNS = 30

export type RunStatus = 'running' | 'ok' | 'warning' | 'interrupted'

function toSite(s: ScrapeRunPayload['sites'][number]): ScrapeSiteResult {
  return {
    siteId: s.site_id, city: s.city ?? null, seen: s.seen, new: s.new, updated: s.updated, unchanged: s.unchanged,
    removed: s.removed, filtered: s.filtered, quarantined: s.quarantined, pushed: s.pushed, pushFailed: s.push_failed,
    pages: s.pages, health: s.health, healthDetail: s.health_detail, errors: s.errors, errorCount: s.error_count,
    quarantine: s.quarantine, startedAt: s.started_at, finishedAt: s.finished_at,
  }
}

/** 寫入（或更新）一次執行。回傳這次回報是否讓執行「剛結束」（用來決定要不要寄通知） */
export async function reportRun(db: Db, p: ScrapeRunPayload) {
  const sites = p.sites.map(toSite)
  const status: RunStatus = !p.finished ? 'running' : sites.every((s) => s.health === 'ok') ? 'ok' : 'warning'
  const [prev] = await db.select({ status: scrapeRuns.status }).from(scrapeRuns).where(eq(scrapeRuns.id, p.run_id))
  const values = {
    status,
    intervalDays: p.interval_days ?? null,
    planned: p.planned,
    current: p.finished ? null : (p.current ?? null),
    sites,
    finishedAt: p.finished ? new Date() : null,
    updatedAt: new Date(),
  }
  const [run] = await db
    .insert(scrapeRuns)
    .values({ id: p.run_id, trigger: p.trigger, startedAt: new Date(p.started_at), ...values })
    .onConflictDoUpdate({ target: scrapeRuns.id, set: values })
    .returning()
  return { run: run!, finishedNow: p.finished && (!prev || prev.status === 'running' || prev.status === 'interrupted') }
}

const totals = (sites: ScrapeSiteResult[]) => {
  const sum = (k: 'seen' | 'new' | 'updated' | 'removed' | 'pushed' | 'quarantined' | 'errorCount') => sites.reduce((n, s) => n + s[k], 0)
  return {
    seen: sum('seen'), new: sum('new'), updated: sum('updated'), removed: sum('removed'), pushed: sum('pushed'),
    quarantined: sum('quarantined'), errors: sum('errorCount'), notOk: sites.filter((s) => s.health !== 'ok').length,
  }
}

type Run = typeof scrapeRuns.$inferSelect

const summarize = (r: Run) => ({
  id: r.id, trigger: r.trigger, status: r.status, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
  updatedAt: r.updatedAt.toISOString(), planned: r.planned.length, done: r.sites.length, current: r.current, totals: totals(r.sites),
})

/** 下一次預定的時間與是否逾期（以最近一次的開始時間計算） */
export function schedule(latest: Pick<Run, 'startedAt' | 'intervalDays'> | undefined, now = new Date()) {
  const intervalDays = latest?.intervalDays ?? DEFAULT_INTERVAL_DAYS
  if (!latest) return { intervalDays, nextDueAt: null, overdue: false }
  const due = latest.startedAt.getTime() + intervalDays * 86_400_000
  return { intervalDays, nextDueAt: new Date(due).toISOString(), overdue: now.getTime() > due + OVERDUE_GRACE_MS }
}

/** 管理後台：排程狀態、最近的執行、各站最近一次的結果 */
export async function scraperStatus(db: Db, now = new Date()) {
  const runs = await db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(RECENT_RUNS)
  const programs = await db
    .select({
      siteId: welfarePrograms.siteId,
      active: sql<number>`count(*) filter (where ${welfarePrograms.status} = 'active')::int`,
      total: sql<number>`count(*) filter (where ${welfarePrograms.status} <> 'removed')::int`,
    })
    .from(welfarePrograms)
    .groupBy(welfarePrograms.siteId)
  const bySite = new Map(programs.map((p) => [p.siteId, p]))

  // 各站：最近一次有跑到的結果，以及最近一次 ok 的時間
  const sites = new Map<string, { last: ScrapeSiteResult; runId: string; lastOkAt: string | null }>()
  for (const r of runs) {
    for (const s of r.sites) {
      const cur = sites.get(s.siteId)
      if (!cur) sites.set(s.siteId, { last: s, runId: r.id, lastOkAt: s.health === 'ok' ? s.finishedAt : null })
      else if (!cur.lastOkAt && s.health === 'ok') cur.lastOkAt = s.finishedAt
    }
  }
  for (const p of programs) if (p.siteId && !sites.has(p.siteId)) sites.set(p.siteId, { last: null!, runId: '', lastOkAt: null })

  return {
    ...schedule(runs[0], now),
    latest: runs[0] ? summarize(runs[0]) : null,
    runs: runs.map(summarize),
    sites: [...sites.entries()]
      .map(([siteId, v]) => {
        const { quarantine: _q, errors: _e, ...last } = v.last ?? ({} as Partial<ScrapeSiteResult>)
        return {
          siteId,
          city: v.last?.city ?? null,
          runId: v.runId || null,
          last: v.last ? last : null,
          lastOkAt: v.lastOkAt,
          programs: { active: bySite.get(siteId)?.active ?? 0, total: bySite.get(siteId)?.total ?? 0 },
        }
      })
      .sort((a, b) => a.siteId.localeCompare(b.siteId)),
  }
}

export async function getRun(db: Db, id: string) {
  const [r] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.id, id))
  return r ? { ...summarize(r), intervalDays: r.intervalDays, plannedSites: r.planned, sites: r.sites } : null
}

/** 執行中但太久沒有回報的，改為 interrupted 並回傳（背景工作每小時檢查） */
export async function markStale(db: Db, now = new Date()) {
  return db
    .update(scrapeRuns)
    .set({ status: 'interrupted', current: null })
    .where(and(eq(scrapeRuns.status, 'running'), lt(scrapeRuns.updatedAt, new Date(now.getTime() - STALE_MS))))
    .returning()
}

export async function latestRun(db: Db) {
  const [r] = await db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(1)
  return r
}

/** 通知信的內容：各站一行，不是 ok 的附上原因與前幾個錯誤 */
export function runReportText(r: Run) {
  const t = totals(r.sites)
  const lines = [
    `執行 ${r.id}（${r.trigger === 'schedule' ? '排程' : '手動'}）：${r.status}`,
    `站點 ${r.sites.length}/${r.planned.length}，看到 ${t.seen}、新增 ${t.new}、更新 ${t.updated}、下架 ${t.removed}、推送 ${t.pushed}、隔離 ${t.quarantined}、錯誤 ${t.errors}`,
    '',
  ]
  for (const s of r.sites) {
    lines.push(`${s.health === 'ok' ? '✓' : '✗'} ${s.siteId}（${s.city ?? ''}）${s.health}${s.healthDetail ? `：${s.healthDetail}` : ''}　看到 ${s.seen}、推送 ${s.pushed}`)
    if (s.health !== 'ok') for (const e of s.errors.slice(0, 3)) lines.push(`    - ${e}`)
  }
  const missing = r.planned.filter((id) => !r.sites.some((s) => s.siteId === id))
  if (missing.length) lines.push('', `沒有跑到的站點：${missing.join('、')}`)
  return lines.join('\n')
}
