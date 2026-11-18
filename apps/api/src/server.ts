import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb } from './db/client.ts'
import { loadEnv } from './env.ts'
import { type Jobs, startJobs } from './jobs/index.ts'
import { createAuth } from './lib/auth.ts'
import { LogMailer, ResendMailer } from './lib/mail/index.ts'
import { createStorage } from './lib/storage.ts'

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL)
const mailer = env.MAIL_DRIVER === 'resend' ? new ResendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM) : new LogMailer()
const storage = createStorage(env)
const auth = createAuth(db, env, mailer)
const app = createApp({ db, auth, env, mailer, storage })

const jobs: Jobs | null = env.WORKER_MODE === 'inline' ? await startJobs({ db, databaseUrl: env.DATABASE_URL }) : null

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`api listening on http://${info.address}:${info.port} (jobs: ${env.WORKER_MODE})`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await jobs?.stop()
      await sql.end({ timeout: 5 })
      process.exit(0)
    })
  })
}
