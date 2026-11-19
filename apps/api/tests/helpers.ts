import { eq, sql } from 'drizzle-orm'
import { createApp } from '../src/app.ts'
import { createDb } from '../src/db/client.ts'
import { user } from '../src/db/schema/index.ts'
import { createAuth } from '../src/lib/auth.ts'
import { MemoryMailer } from '../src/lib/mail/index.ts'
import { MemoryQueue } from '../src/lib/queue.ts'
import { MemoryStorage, type Storage } from '../src/lib/storage.ts'
import { testEnv } from './test-env.ts'

export const ORIGIN = 'http://localhost:3000'

export function setupApp(overrides: Partial<Record<string, string>> = {}, opts: { storage?: Storage | null } = {}) {
  const env = testEnv(overrides)
  const { db, sql: client } = createDb(env.DATABASE_URL, { max: 2 })
  const mailer = new MemoryMailer()
  const storage = opts.storage === undefined ? new MemoryStorage() : opts.storage
  const auth = createAuth(db, env, mailer)
  const queue = new MemoryQueue()
  const app = createApp({ db, auth, env, mailer, storage, queue })
  return { app, db, env, mailer, storage, queue, close: () => client.end() }
}

type T = ReturnType<typeof setupApp>

export async function resetDb(db: T['db']) {
  await db.execute(
    sql`truncate table "user", session, account, verification, faqs, worker_heartbeat, welfare_programs, welfare_attachments, welfare_sources, ingest_log, favorites cascade`,
  )
}

export const PASSWORD = 'correct-horse-battery'

export function authPost(app: T['app'], path: string, body: object, headers: Record<string, string> = {}) {
  return app.request(`/v1/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  })
}

/** 只註冊（會寄出驗證信，尚未驗證） */
export function signUpOnly(app: T['app'], email: string, extra: object = {}) {
  return authPost(app, '/sign-up/email', { email, password: PASSWORD, name: '測試使用者', ...extra })
}

/** 註冊 → 直接標記為已驗證 → 登入，回傳 session cookie */
export async function signUp(t: Pick<T, 'app' | 'db'>, email = 'user@example.com', extra: object = {}) {
  const res = await signUpOnly(t.app, email, extra)
  await t.db.update(user).set({ emailVerified: true }).where(eq(user.email, email))
  const login = await authPost(t.app, '/sign-in/email', { email, password: PASSWORD })
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { res, login, cookie }
}
