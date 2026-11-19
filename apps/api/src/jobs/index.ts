// 背景工作（docs/backend.md §8.4）：pg-boss 佇列與 cron，並定期寫入心跳供 /health 檢查。
// 預設在 API 程序內執行（WORKER_MODE=inline）；工作量變大時改為 separate，由 src/worker.ts 獨立執行。
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { workerHeartbeat } from '../db/schema/index.ts'
import type { Structurer } from '../features/welfare/structure.ts'
import type { LLM } from '../lib/llm/index.ts'
import { type Boss, BossQueue } from '../lib/queue.ts'
import { backfill, structureProgram } from './structure.ts'

export const HEARTBEAT_NAME = 'jobs'
export const HEARTBEAT_MS = 15_000

export type Jobs = { stop: () => Promise<void> }

export async function startJobs(opts: {
  db: Db
  boss: Boss
  structurer: Structurer
  llm: LLM | null
  heartbeatMs?: number
}): Promise<Jobs> {
  const { db, boss, structurer, llm } = opts

  // 一次處理一筆：結構化會呼叫 LLM，避免和 API 搶資源，也避免超過 Gemini 的速率限制
  await boss.work<{ programId: string }>('welfare-structure', { batchSize: 1 }, async ([job]) => {
    if (!job) return
    const outcome = await structureProgram(db, structurer, llm, job.data.programId)
    return { outcome }
  })
  const queued = await backfill(db, new BossQueue(boss), structurer)
  if (queued) console.log(`[jobs] welfare-structure: queued ${queued} programs (${structurer.kind})`)

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
      await boss.offWork('welfare-structure')
    },
  }
}
