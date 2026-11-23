// 爬蟲的執行回報（POST /internal/scrape-runs）。欄位沿用 Python 端的 snake_case（services/scraper/src/scraper/report.py）
import { z } from 'zod'

const count = z.number().int().min(0)

export const ScrapeSitePayload = z.object({
  site_id: z.string().min(1).max(50),
  city: z.string().max(20).nullable().optional(),
  seen: count,
  new: count,
  updated: count,
  unchanged: count,
  removed: count,
  filtered: count,
  quarantined: count,
  pushed: count,
  push_failed: count,
  pages: count,
  health: z.enum(['ok', 'degraded', 'blocked', 'failed']),
  health_detail: z.string().max(500),
  errors: z.array(z.string().max(500)).max(50),
  error_count: count,
  quarantine: z.array(z.object({ title: z.string().max(300), url: z.string().max(2000), issues: z.array(z.string().max(100)).max(10) })).max(100),
  started_at: z.iso.datetime({ offset: true }),
  finished_at: z.iso.datetime({ offset: true }),
})

export const ScrapeRunPayload = z.object({
  run_id: z.string().regex(/^\d{8}-\d{6}$/),
  trigger: z.enum(['schedule', 'manual']),
  interval_days: z.number().int().min(1).max(30).nullable().optional(),
  started_at: z.iso.datetime({ offset: true }),
  /** true＝全部站點都跑完（最後一次回報） */
  finished: z.boolean(),
  planned: z.array(z.string().min(1).max(50)).max(50),
  /** 正在跑的站點 */
  current: z.string().max(50).nullable().optional(),
  sites: z.array(ScrapeSitePayload).max(50),
})
export type ScrapeRunPayload = z.infer<typeof ScrapeRunPayload>
