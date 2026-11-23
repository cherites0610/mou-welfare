// 背景工作（docs/backend.md §8.4）：pg-boss 佇列與 cron，並定期寫入心跳供 /health 檢查。
// 預設在 API 程序內執行（WORKER_MODE=inline）；工作量變大時改為 separate，由 src/worker.ts 獨立執行。
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.ts'
import { workerHeartbeat } from '../db/schema/index.ts'
import type { Structurer } from '../features/welfare/structure.ts'
import { type LLM, LLMError } from '../lib/llm/index.ts'
import type { Mailer } from '../lib/mail/index.ts'
import { type Boss, BossQueue } from '../lib/queue.ts'
import { LLMPause, PROBE_MS } from './llm-pause.ts'
import { backfill, structureProgram } from './structure.ts'

export const HEARTBEAT_NAME = 'jobs'
export const HEARTBEAT_MS = 15_000

export type Jobs = { stop: () => Promise<void> }

export async function startJobs(opts: {
  db: Db
  boss: Boss
  structurer: Structurer
  llm: LLM | null
  /** 額度不足暫停與恢復時寄信通知（未設定 ALERT_EMAIL 時只記 log） */
  mailer?: Mailer
  alertTo?: string
  heartbeatMs?: number
  probeMs?: number
}): Promise<Jobs> {
  const { db, boss, structurer, llm } = opts
  const queue = new BossQueue(boss)

  const queueBackfill = async () => {
    const queued = await backfill(db, queue, structurer)
    if (queued) console.log(`[jobs] welfare-structure: queued ${queued} programs (${structurer.kind})`)
  }

  // 一次處理一筆：結構化會呼叫 LLM，避免和 API 搶資源，也避免超過 Gemini 的速率限制。
  // pg-boss 預設每 2 秒才取一次工作，佇列有積壓時太慢（每秒不到一筆），縮短為 0.5 秒
  const work = () =>
    boss.work<{ programId: string; force?: boolean }>('welfare-structure', { batchSize: 1, pollingIntervalSeconds: 0.5 }, async ([job]) => {
      if (!job) return
      try {
        const outcome = await structureProgram(db, structurer, llm, job.data.programId, undefined, { force: job.data.force })
        return { outcome }
      } catch (e) {
        // 額度不足時每筆都會失敗：停止取工作，等探測成功再恢復（這筆照常交給 pg-boss 重試）
        if (pause && e instanceof LLMError && e.kind === 'quota' && (await pause.pause(e.message))) {
          setImmediate(() => boss.offWork('welfare-structure').catch((err) => console.error('[jobs offWork]', err)))
        }
        throw e
      }
    })

  // 只有真的呼叫 LLM 時才需要暫停機制（規則結構化不會遇到額度問題）
  const pause = llm
    ? new LLMPause(db, {
        probe: () => llm.generate({ system: '只輸出 JSON。', input: 'ok', schema: z.object({ ok: z.boolean() }) }),
        onResume: async () => {
          await work()
          await queueBackfill()
        },
        notify: async (subject, text) => {
          if (opts.mailer && opts.alertTo) await opts.mailer.send({ to: opts.alertTo, subject, text, html: `<pre>${escapeHtml(text)}</pre>` })
          else console.warn(`[llm] ${subject}`)
        },
      })
    : null

  if (pause && (await pause.load())) {
    // 重啟前就在暫停中：先不取工作，立刻探測一次（儲值後重新部署就會馬上恢復）
    console.warn('[jobs] welfare-structure paused (LLM quota); probing')
    void pause.probe().catch((e) => console.error('[llm probe]', e))
  } else {
    await work()
    await queueBackfill()
  }
  const probeTimer = pause
    ? setInterval(() => pause.probe().catch((e) => console.error('[llm probe]', e)), opts.probeMs ?? PROBE_MS)
    : null

  // TODO(P4)：notify、deadline-reminder、expire、cleanup 等 cron

  const beat = () =>
    db
      .insert(workerHeartbeat)
      .values({ name: HEARTBEAT_NAME })
      .onConflictDoUpdate({ target: workerHeartbeat.name, set: { beatAt: sql`now()` } })
  await beat()
  const timer = setInterval(() => beat().catch((e) => console.error('[jobs heartbeat]', e)), opts.heartbeatMs ?? HEARTBEAT_MS)

  return {
    stop: async () => {
      clearInterval(timer)
      if (probeTimer) clearInterval(probeTimer)
      await boss.offWork('welfare-structure')
    },
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
