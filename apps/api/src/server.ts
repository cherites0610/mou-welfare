import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb } from './db/client.ts'
import { loadEnv } from './env.ts'
import { type Jobs, startJobs } from './jobs/index.ts'
import { lineBotOf } from './lib/line.ts'
import { createStructurer } from './jobs/structure.ts'
import { dbUsageRecorder } from './lib/llm/index.ts'
import { createAuth } from './lib/auth.ts'
import { LogMailer, ResendMailer } from './lib/mail/index.ts'
import { BossQueue, createBoss } from './lib/queue.ts'
import { createStorage } from './lib/storage.ts'

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL)
const mailer = env.MAIL_DRIVER === 'resend' ? new ResendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM) : new LogMailer()
const storage = createStorage(env)
const auth = createAuth(db, env, mailer)
// API 程序一定要能送出工作（爬蟲推送後排入結構化）；是否在本程序執行工作由 WORKER_MODE 決定
const boss = await createBoss(env.DATABASE_URL)
const { structurer, llm } = createStructurer(env, dbUsageRecorder(db))
const app = createApp({ db, auth, env, mailer, storage, queue: new BossQueue(boss), llm })
const jobs: Jobs | null = env.WORKER_MODE === 'inline' ? await startJobs({ db, boss, structurer, llm, mailer, alertTo: env.ALERT_EMAIL, line: lineBotOf(env) }) : null

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`api listening on http://${info.address}:${info.port} (jobs: ${env.WORKER_MODE}, structurer: ${structurer.kind})`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await jobs?.stop()
      await boss.stop({ graceful: true, timeout: 10_000 })
      await sql.end({ timeout: 5 })
      process.exit(0)
    })
  })
}
