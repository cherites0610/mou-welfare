// 獨立的背景工作程序，只在 WORKER_MODE=separate 時使用（預設 inline 由 API 程序執行）。
import { createDb } from './db/client.ts'
import { loadEnv } from './env.ts'
import { startJobs } from './jobs/index.ts'
import { createStructurer } from './jobs/structure.ts'
import { createBoss } from './lib/queue.ts'

const env = loadEnv()
if (env.WORKER_MODE !== 'separate') {
  console.error(`WORKER_MODE=${env.WORKER_MODE}：背景工作由 API 程序執行，不需要啟動 worker`)
  process.exit(1)
}

const { db, sql } = createDb(env.DATABASE_URL, { max: 3 })
const boss = await createBoss(env.DATABASE_URL)
const { structurer, llm } = createStructurer(env)
const jobs = await startJobs({ db, boss, structurer, llm })
console.log(`worker started (structurer: ${structurer.kind})`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await jobs.stop()
    await boss.stop({ graceful: true, timeout: 10_000 })
    await sql.end({ timeout: 5 })
    process.exit(0)
  })
}
