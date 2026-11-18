// 背景工作程序：pg-boss consumer + cron，並每 15 秒寫入心跳供 /health 檢查。
import { sql as dsql } from 'drizzle-orm'
import { createDb } from './db/client.ts'
import { workerHeartbeat } from './db/schema/index.ts'
import { loadEnv } from './env.ts'
import { createBoss } from './lib/queue.ts'

export const HEARTBEAT_NAME = 'worker'
export const HEARTBEAT_MS = 15_000

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL, { max: 3 })
const boss = await createBoss(env.DATABASE_URL)

// TODO(P2)：welfare-structure、notify 的處理函式；TODO(P4)：deadline-reminder 等 cron
async function beat() {
  await db
    .insert(workerHeartbeat)
    .values({ name: HEARTBEAT_NAME })
    .onConflictDoUpdate({ target: workerHeartbeat.name, set: { beatAt: dsql`now()` } })
}
await beat()
const timer = setInterval(() => beat().catch((e) => console.error('[heartbeat]', e)), HEARTBEAT_MS)
console.log('worker started')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    clearInterval(timer)
    await boss.stop({ graceful: true })
    await sql.end({ timeout: 5 })
    process.exit(0)
  })
}
