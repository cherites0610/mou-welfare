import { sql } from 'drizzle-orm'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { createAuth } from '../src/lib/auth.ts'
import { testEnv } from './test-env.ts'

export function setupApp(overrides: Partial<Record<string, string>> = {}) {
  const env = testEnv(overrides)
  const { db, sql: client } = createDb(env.DATABASE_URL, { max: 2 })
  const auth = createAuth(db, env)
  const app = createApp({ db, auth, env })
  return { app, db, env, close: () => client.end() }
}

export async function resetDb(db: ReturnType<typeof setupApp>['db']) {
  await db.execute(sql`truncate table "user", session, account, verification, faqs, worker_heartbeat cascade`)
}

/** 透過 Better Auth 註冊並回傳 session cookie */
export async function signUp(app: ReturnType<typeof setupApp>['app'], email = 'user@example.com', extra: object = {}) {
  const res = await app.request('/v1/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email, password: 'correct-horse-battery', name: '測試使用者', ...extra }),
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { res, cookie }
}
