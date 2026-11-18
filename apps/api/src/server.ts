import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb } from './db/client.ts'
import { loadEnv } from './env.ts'
import { createAuth } from './lib/auth.ts'

const env = loadEnv()
const { db, sql } = createDb(env.DATABASE_URL)
const auth = createAuth(db, env)
const app = createApp({ db, auth, env })

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`api listening on http://${info.address}:${info.port}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(async () => {
      await sql.end({ timeout: 5 })
      process.exit(0)
    })
  })
}
