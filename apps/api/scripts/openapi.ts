// 產生 apps/api/openapi.json（前端 client 由此產生）。加上 --check 時只比對，不一致就失敗（CI 契約檢查）。
import { readFileSync, writeFileSync } from 'node:fs'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { loadEnv } from '../src/env.ts'
import { createAuth } from '../src/lib/auth.ts'
import { LogMailer } from '../src/lib/mail/index.ts'
import { MemoryQueue } from '../src/lib/queue.ts'

// 產生文件不需要連資料庫（postgres.js 在第一次查詢前不會連線）
const env = loadEnv({
  DATABASE_URL: 'postgresql://openapi@localhost:5432/none',
  BETTER_AUTH_SECRET: 'openapi-generation-only-not-a-real-secret-7f3a9c',
  BETTER_AUTH_URL: 'http://localhost:5030',
  INGEST_HMAC_KEY: 'openapi-generation-only-not-a-real-key-1b8e4d',
  WORKER_MODE: 'off',
})
const { db, sql } = createDb(env.DATABASE_URL, { max: 1 })
const mailer = new LogMailer()
const app = createApp({ db, auth: createAuth(db, env, mailer), env, mailer, storage: null, queue: new MemoryQueue() })
const doc = await (await app.request('/openapi.json')).json()
await sql.end()

const path = new URL('../openapi.json', import.meta.url)
const next = JSON.stringify(doc, null, 2) + '\n'
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(path, 'utf8')
  } catch {}
  if (current !== next) {
    console.error('openapi.json 與程式不一致（請執行 pnpm --filter @mou-welfare/api openapi）')
    process.exit(1)
  }
  console.log('openapi.json up to date')
} else {
  writeFileSync(path, next)
  console.log('wrote openapi.json')
}
