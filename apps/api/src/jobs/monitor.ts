// 每小時的系統檢查（docs/backend.md §8.4.2）：爬蟲中斷、爬蟲逾期、結構化錯誤增加 → 寄信到 ALERT_EMAIL。
// API 本身掛掉時這裡也不會執行，由 GitHub Actions 的 uptime 工作從外部檢查 /health。
import { isNotNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { welfarePrograms } from '../db/schema/index.ts'
import { latestRun, markStale, runReportText, schedule, STALE_MS } from '../features/scraper/service.ts'
import { clearAlert, type Notify, notifyOnce } from '../lib/notify.ts'

export const MONITOR_MS = 60 * 60_000
const DAY_MS = 86_400_000

export async function runMonitor(db: Db, notify: Notify, now = new Date()) {
  // 1. 執行中但太久沒有回報：程序可能被中斷（主機重開、記憶體不足）
  for (const r of await markStale(db, now)) {
    await notifyOnce(db, notify, `scrape-interrupted:${r.id}`, r.id, `【哞福利】爬蟲執行中斷（${r.id}）`,
      `執行 ${r.id} 已經 ${STALE_MS / 3600_000} 小時沒有回報，判定為中斷。下一次排程會重新執行。\n\n${runReportText(r)}`)
  }

  // 2. 逾期：超過預定時間一天還沒有新的執行（排程沒有啟動，或主機的 cron 被移除）
  const latest = await latestRun(db)
  const s = schedule(latest, now)
  if (s.overdue && latest) {
    await notifyOnce(db, notify, 'scrape-overdue', latest.id, '【哞福利】爬蟲排程逾期',
      `最近一次執行是 ${latest.id}，預定 ${s.nextDueAt} 執行下一次，目前還沒有開始。\n` +
        '請檢查主機的 crontab 與 ~/.local/state/mou-welfare-scraper/ 下的紀錄（docs/scraper.md §10.4）。', DAY_MS)
  } else {
    await clearAlert(db, 'scrape-overdue')
  }

  // 3. 結構化錯誤增加（數量變多才通知；修好歸零後清掉）
  const [{ errors } = { errors: 0 }] = await db
    .select({ errors: sql<number>`count(*)::int` })
    .from(welfarePrograms)
    .where(isNotNull(welfarePrograms.structureError))
  const key = 'structure-errors'
  if (errors === 0) await clearAlert(db, key)
  else {
    const [prev] = await db.execute<{ value: string }>(sql`select value from alert_state where key = ${key}`)
    if (!prev || errors > Number(prev.value)) {
      await notifyOnce(db, notify, key, String(errors), `【哞福利】福利結構化錯誤 ${errors} 筆`,
        `目前有 ${errors} 筆福利結構化失敗（pg-boss 重試後仍失敗）。可以在管理後台的福利列表篩選「有錯誤」查看原因，修正後重新結構化。`)
    }
  }
}
