import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client.ts'
import * as schema from '../db/schema/index.ts'
import type { Env } from '../env.ts'

export const AUTH_BASE_PATH = '/v1/auth'

export function createAuth(db: Db, env: Env) {
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
      // TODO(P1)：串接 Resend 後改為 true，並設定 sendVerificationEmail / sendResetPassword
      requireEmailVerification: false,
    },
    user: {
      // 福利比對欄位一律 input: false：不能透過登入 / 註冊端點寫入，只能走 PATCH /v1/me（呼應回歸測試 R10）
      additionalFields: {
        birthday: { type: 'string', required: false, input: false },
        gender: { type: 'string', required: false, input: false },
        city: { type: 'string', required: false, input: false },
        identities: { type: 'string[]', required: false, input: false, defaultValue: [] },
        role: { type: 'string', required: false, input: false, defaultValue: 'user' },
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
