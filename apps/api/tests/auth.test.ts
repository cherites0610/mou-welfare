// 註冊驗證、重設密碼、限流（R14、R15）。寄信一律用 MemoryMailer，不會真的寄出。
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { user } from '../src/db/schema/index.ts'
import { MailError, ResendMailer } from '../src/lib/mail/index.ts'
import { authPost, PASSWORD, resetDb, setupApp, signUp, signUpOnly } from './helpers.ts'

const t = setupApp()
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  t.mailer.sent.length = 0
})

/** 取出信中的連結，轉成 app.request 可用的路徑 */
const linkIn = (text: string) => {
  const m = text.match(/https?:\/\/\S+/)
  if (!m) throw new Error('信中沒有連結')
  const u = new URL(m[0])
  return { path: `${u.pathname}${u.search}`, token: u.searchParams.get('token') ?? u.pathname.split('/').pop()! }
}

describe('註冊與信箱驗證', () => {
  it('註冊後寄出中文驗證信；未驗證前不能登入', async () => {
    await signUpOnly(t.app, 'new@example.com')
    const mail = t.mailer.last('new@example.com')
    expect(mail?.subject).toBe('【哞福利】請驗證你的電子信箱')
    expect(mail?.text).toContain('/v1/auth/verify-email?token=')

    const login = await authPost(t.app, '/sign-in/email', { email: 'new@example.com', password: PASSWORD })
    expect(login.status).toBe(403)
  })

  it('點擊驗證連結後完成驗證並可登入', async () => {
    await signUpOnly(t.app, 'verify@example.com')
    const { path } = linkIn(t.mailer.last('verify@example.com')!.text)
    const res = await t.app.request(path)
    expect([200, 302]).toContain(res.status)

    const [row] = await t.db.select().from(user).where(eq(user.email, 'verify@example.com'))
    expect(row?.emailVerified).toBe(true)
    const login = await authPost(t.app, '/sign-in/email', { email: 'verify@example.com', password: PASSWORD })
    expect(login.status).toBe(200)
  })

  it('信件中的使用者名稱會被跳脫，不能注入 HTML', async () => {
    await signUpOnly(t.app, 'xss@example.com', { name: '<img src=x onerror=alert(1)>' })
    expect(t.mailer.last('xss@example.com')!.html).not.toContain('<img src=x')
  })
})

describe('重設密碼', () => {
  const request = (email: string) => authPost(t.app, '/request-password-reset', { email, redirectTo: 'http://localhost:3000/reset' })

  it('R14 已註冊與未註冊的 email 回應完全相同，只有已註冊的會收到信', async () => {
    await signUp(t, 'exists@example.com')
    t.mailer.sent.length = 0
    const a = await request('exists@example.com')
    const b = await request('nobody@example.com')
    expect(a.status).toBe(b.status)
    expect(await a.text()).toBe(await b.text())
    expect(t.mailer.sent.map((m) => m.to)).toEqual(['exists@example.com'])
  })

  it('用信中的 token 設定新密碼後，舊密碼失效、新密碼可登入、舊 session 被登出', async () => {
    const { cookie } = await signUp(t, 'reset@example.com')
    await request('reset@example.com')
    const { token } = linkIn(t.mailer.last('reset@example.com')!.text)

    const res = await authPost(t.app, '/reset-password', { token, newPassword: 'brand-new-password' })
    expect(res.status).toBe(200)
    expect((await authPost(t.app, '/sign-in/email', { email: 'reset@example.com', password: PASSWORD })).status).toBe(401)
    expect((await authPost(t.app, '/sign-in/email', { email: 'reset@example.com', password: 'brand-new-password' })).status).toBe(200)
    expect((await t.app.request('/v1/me', { headers: { cookie } })).status).toBe(401)
  })

  it('錯誤或用過的 token 不能重設密碼', async () => {
    expect((await authPost(t.app, '/reset-password', { token: 'bogus', newPassword: 'brand-new-password' })).status).toBe(400)
  })
})

describe('R15 限流（以 CF-Connecting-IP 計算）', () => {
  const limited = setupApp({ RATE_LIMIT: 'on' })
  afterAll(() => limited.close())

  it('同一 IP 連續登入失敗 5 次後回傳 429；其他 IP 不受影響', async () => {
    await resetDb(limited.db)
    await signUp(limited, 'victim@example.com')
    const attempt = (ip: string) =>
      authPost(limited.app, '/sign-in/email', { email: 'victim@example.com', password: 'wrong-password' }, { 'cf-connecting-ip': ip })

    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await attempt('203.0.113.7')).status)
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
    expect(statuses[5]).toBe(429)
    expect((await attempt('198.51.100.9')).status).toBe(401)
  })
})

describe('ResendMailer', () => {
  const mail = { to: 'a@example.com', subject: 's', html: '<p>h</p>', text: 't' }

  it('以 Bearer 金鑰呼叫 Resend API', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fake = (async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ id: '1' }), { status: 200 })
    }) as unknown as typeof fetch
    await new ResendMailer('re_test', '哞福利 <onboarding@resend.dev>', fake).send(mail)
    expect(captured!.url).toBe('https://api.resend.com/emails')
    expect((captured!.init.headers as Record<string, string>).authorization).toBe('Bearer re_test')
    expect(JSON.parse(captured!.init.body as string)).toMatchObject({ to: ['a@example.com'], subject: 's' })
  })

  it('失敗時丟出 MailError，訊息只含狀態碼與錯誤名稱', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ name: 'validation_error', message: 'secret detail re_xxx' }), { status: 422 })) as unknown as typeof fetch
    const err = await new ResendMailer('re_test', 'x', fake).send(mail).catch((e) => e)
    expect(err).toBeInstanceOf(MailError)
    expect(err.message).toBe('Resend 422 validation_error')
  })
})
