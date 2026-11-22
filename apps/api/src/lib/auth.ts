import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client.ts'
import * as schema from '../db/schema/index.ts'
import type { Env } from '../env.ts'
import type { Mailer } from './mail/index.ts'
import { resetPasswordMail, verificationMail } from './mail/templates.ts'

export const AUTH_BASE_PATH = '/v1/auth'

export function createAuth(db: Db, env: Env, mailer: Mailer) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      // R14：Better Auth 對不存在的 email 也回傳相同結果，只是不寄信
      sendResetPassword: async ({ user, url }) => {
        await mailer.send(resetPasswordMail(user.email, user.name, url))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send(verificationMail(user.email, user.name, url))
      },
    },
    // R15：登入、註冊、重設密碼限流（以 CF-Connecting-IP 計算，見 advanced.ipAddress）
    rateLimit: {
      enabled: env.RATE_LIMIT === 'on',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },
    user: {
      // 福利比對欄位一律 input: false：不能透過登入 / 註冊端點寫入，只能走 PATCH /v1/me（呼應回歸測試 R10）
      additionalFields: {
        birthday: { type: 'string', required: false, input: false },
        gender: { type: 'string', required: false, input: false },
        city: { type: 'string', required: false, input: false },
        identities: { type: 'string[]', required: false, input: false, defaultValue: [] },
        role: { type: 'string', required: false, input: false, defaultValue: 'user' },
        isSubscribed: { type: 'boolean', required: false, input: false, defaultValue: false },
      },
    },
    advanced: {
      // 經 Cloudflare / Caddy 代理時，真實 IP 在 CF-Connecting-IP（限流用，回歸測試 R15）
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user']
