// 第三方登入（Google / LINE / LIFF ID Token，docs/backend.md §8.5.1）。
// LINE 的 ID Token 驗證會呼叫 api.line.me/oauth2/v2.1/verify，這裡以 stub 的 fetch 取代，不會連外。
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { account, user } from '../src/db/schema/index.ts'
import { loadEnv } from '../src/env.ts'
import { authPost, resetDb, setupApp, signUp, signUpOnly } from './helpers.ts'
import { testDatabaseUrl } from './test-env.ts'

const LINE_CHANNEL_ID = '2000000000'
const t = setupApp({
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  LINE_CHANNEL_ID,
  LINE_CHANNEL_SECRET: 'line-channel-secret',
})
const bare = setupApp()
afterAll(async () => {
  await t.close()
  await bare.close()
})

/** 不簽章的 JWT：Better Auth 只用 decodeJwt 讀內容，真偽由 LINE 的 /verify 判斷（下方 stub） */
const jwt = (payload: object) =>
  [{ alg: 'none', typ: 'JWT' }, payload].map((x) => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') + '.'

let verifyAud = LINE_CHANNEL_ID
const verifyCalls: URLSearchParams[] = []
beforeEach(async () => {
  await resetDb(t.db)
  t.mailer.sent.length = 0
  verifyAud = LINE_CHANNEL_ID
  verifyCalls.length = 0
  const real = globalThis.fetch
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://api.line.me/oauth2/v2.1/verify') {
      verifyCalls.push(new URLSearchParams(String(init?.body)))
      return Response.json({ iss: 'https://access.line.me', aud: verifyAud, sub: 'x' })
    }
    return real(input, init)
  })
})
afterEach(() => vi.unstubAllGlobals())

const liffLogin = (payload: object) =>
  authPost(t.app, '/sign-in/social', {
    provider: 'line',
    idToken: { token: jwt({ iss: 'https://access.line.me', aud: LINE_CHANNEL_ID, exp: 9_999_999_999, ...payload }) },
  })

describe('啟用條件', () => {
  it('未設定金鑰時，第三方登入回 404（前端顯示「即將開放」）', async () => {
    const res = await authPost(bare.app, '/sign-in/social', { provider: 'google', callbackURL: 'http://localhost:3000/welfares' })
    expect(res.status).toBe(404)
  })

  it('ID 與 secret 必須成對設定', () => {
    const base = {
      DATABASE_URL: testDatabaseUrl(),
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:5030',
      INGEST_HMAC_KEY: 'y'.repeat(32),
    }
    expect(() => loadEnv({ ...base, LINE_CHANNEL_ID: '1' })).toThrow(/LINE_CHANNEL_SECRET/)
    expect(() => loadEnv({ ...base, GOOGLE_CLIENT_SECRET: 's' })).toThrow(/GOOGLE_CLIENT_ID/)
  })
})

describe('Google（OAuth 轉址）', () => {
  it('回傳 Google 授權網址，callback 指向 API 的 /v1/auth/callback/google', async () => {
    const res = await authPost(t.app, '/sign-in/social', { provider: 'google', callbackURL: 'http://localhost:3000/oauth-callback' })
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const u = new URL(url)
    expect(u.host).toBe('accounts.google.com')
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:5030/v1/auth/callback/google')
    expect(u.searchParams.get('prompt')).toBe('select_account')
    expect(res.headers.get('set-cookie')).toContain('state')
  })

  it('callbackURL 不在 TRUSTED_ORIGINS 時拒絕（避免開放式轉址）', async () => {
    const res = await authPost(t.app, '/sign-in/social', { provider: 'google', callbackURL: 'https://evil.example.com/' })
    expect(res.status).toBe(403)
  })
})

describe('LINE（LIFF ID Token）', () => {
  it('新使用者：建立帳號並登入，email 視為已驗證', async () => {
    const res = await liffLogin({ sub: 'U-new', name: '小明', email: 'Line@Example.com', picture: 'https://profile.line-scdn.net/a' })
    expect(res.status).toBe(200)
    expect(verifyCalls[0]?.get('client_id')).toBe(LINE_CHANNEL_ID)
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
    const me = await t.app.request('/v1/me', { headers: { cookie } })
    expect(me.status).toBe(200)

    const [u] = await t.db.select().from(user).where(eq(user.email, 'line@example.com'))
    expect(u).toMatchObject({ name: '小明', emailVerified: true, image: 'https://profile.line-scdn.net/a' })
    const accounts = await t.db.select().from(account).where(eq(account.userId, u!.id))
    expect(accounts.map((a) => [a.providerId, a.accountId])).toEqual([['line', 'U-new']])
  })

  it('同一個 LINE 帳號再次登入，不會重複建立使用者', async () => {
    await liffLogin({ sub: 'U-same', email: 'same@example.com' })
    const again = await liffLogin({ sub: 'U-same', email: 'same@example.com' })
    expect(again.status).toBe(200)
    expect(await t.db.select().from(user)).toHaveLength(1)
  })

  it('LINE 沒有提供 email：改用 .invalid 替代地址，且不會寄任何信', async () => {
    const res = await liffLogin({ sub: 'U-noemail', name: '無信箱' })
    expect(res.status).toBe(200)
    const [u] = await t.db.select().from(user)
    expect(u).toMatchObject({ email: 'u-noemail@line.invalid', emailVerified: false })

    await authPost(t.app, '/request-password-reset', { email: u!.email, redirectTo: 'http://localhost:3000/reset' })
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('ID Token 不是發給本服務的 channel（aud 不符）時拒絕', async () => {
    verifyAud = '1999999999'
    const res = await liffLogin({ sub: 'U-other', email: 'other@example.com' })
    expect(res.status).toBe(401)
    expect(await t.db.select().from(user)).toHaveLength(0)
  })

  it('email 與已驗證的既有帳號相同：合併到同一個使用者', async () => {
    await signUp(t, 'both@example.com')
    const res = await liffLogin({ sub: 'U-both', email: 'both@example.com' })
    expect(res.status).toBe(200)
    const users = await t.db.select().from(user)
    expect(users).toHaveLength(1)
    const providers = (await t.db.select().from(account).where(eq(account.userId, users[0]!.id))).map((a) => a.providerId)
    expect(providers.sort()).toEqual(['credential', 'line'])
  })

  it('email 與「未驗證」的既有帳號相同：不合併，也不另建帳號（防止先註冊別人的 email 等著被合併）', async () => {
    await signUpOnly(t.app, 'squat@example.com')
    const res = await liffLogin({ sub: 'U-victim', email: 'squat@example.com' })
    expect(res.status).toBe(401)
    expect(await t.db.select().from(account).where(eq(account.providerId, 'line'))).toHaveLength(0)
  })
})

describe('第三方登入的帳號設定密碼（沿用重設密碼的寄信流程）', () => {
  const tokenIn = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).pathname.split('/').pop()!

  it('沒有密碼的 LINE 帳號：收信設定密碼後，可以用 email 和密碼登入', async () => {
    await liffLogin({ sub: 'U-pw', email: 'pw@example.com' })
    await authPost(t.app, '/request-password-reset', { email: 'pw@example.com', redirectTo: 'http://localhost:3000/reset-password' })
    const mail = t.mailer.last('pw@example.com')
    expect(mail?.subject).toBe('【哞福利】設定密碼')

    const res = await authPost(t.app, '/reset-password', { token: tokenIn(mail!.text), newPassword: 'brand-new-password' })
    expect(res.status).toBe(200)
    const login = await authPost(t.app, '/sign-in/email', { email: 'pw@example.com', password: 'brand-new-password' })
    expect(login.status).toBe(200)
    const [u] = await t.db.select().from(user)
    const providers = (await t.db.select().from(account).where(eq(account.userId, u!.id))).map((a) => a.providerId)
    expect(providers.sort()).toEqual(['credential', 'line'])
  })
})
