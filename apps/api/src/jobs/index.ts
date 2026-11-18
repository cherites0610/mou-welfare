// 背景工作（docs/backend.md §8.4）：pg-boss 佇列與 cron，並定期寫入心跳供 /health 檢查。
// 預設在 API 程序內執行（WORKER_MODE=inline）；工作量變大時改為 separate，由 src/worker.ts 獨立執行。
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { workerHeartbeat } from '../db/schema/index.ts'
import { createBoss } from '../lib/queue.ts'

export const HEARTBEAT_NAME = 'jobs'
export const HEARTBEAT_MS = 15_000

export type Jobs = { stop: () => Promise<void> }

export async function startJobs(opts: { db: Db; databaseUrl: string; heartbeatMs?: number }): Promise<Jobs> {
  const { db } = opts
  const boss = await createBoss(opts.databaseUrl)

  // TODO(P2)：welfare-structure（同時處理數設低，避免影響 API 回應）、notify
  // TODO(P4)：deadline-reminder、expire、cleanup 等 cron

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
      await boss.stop({ graceful: true, timeout: 10_000 })
    },
  }
}
