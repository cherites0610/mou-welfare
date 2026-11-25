import { and, eq, isNotNull } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client.ts'
import * as schema from '../db/schema/index.ts'
import type { Env } from '../env.ts'
import type { Mailer } from './mail/index.ts'
import { resetPasswordMail, verificationMail } from './mail/templates.ts'

export const AUTH_BASE_PATH = '/v1/auth'

/**
 * LINE 沒有提供 email 時（channel 未申請 email 權限，或使用者沒有登錄 email）的替代地址。
 * Better Auth 的 user 必須有 email；`.invalid` 是保留網域（RFC 2606），一律不寄信。
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'line.invalid'
export const isPlaceholderEmail = (email: string) => email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)

type LineProfile = { sub: string; email?: string }

/** 只給測試用的密碼雜湊（見 createAuth）：可逆，不能用在任何真實資料。 */
const TEST_PASSWORD_HASHER = {
  hash: async (password: string) => `test:${password}`,
  verify: async ({ hash, password }: { hash: string; password: string }) => hash === `test:${password}`,
}

function socialProviders(env: Env) {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
      : {}),
    ...(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET
      ? {
          line: {
            clientId: env.LINE_CHANNEL_ID,
            clientSecret: env.LINE_CHANNEL_SECRET,
            // LINE 回傳的 email 已由 LINE 驗證過；沒有 email 時改用替代地址（未驗證）
            mapProfileToUser: (p: LineProfile) =>
              p.email ? { email: p.email, emailVerified: true } : { email: `${p.sub}@${PLACEHOLDER_EMAIL_DOMAIN}`, emailVerified: false },
          },
        }
      : {}),
  }
}

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
      // 測試環境不用 scrypt：每次註冊、登入都要算一次，佔 API 測試將近一半的時間。
      // env.ts 限定 NODE_ENV=test 只能連測試資料庫，正式環境不會走到這裡。
      ...(env.NODE_ENV === 'test' ? { password: TEST_PASSWORD_HASHER } : {}),
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      // R14：Better Auth 對不存在的 email 也回傳相同結果，只是不寄信
      sendResetPassword: async ({ user, url }) => {
        if (isPlaceholderEmail(user.email)) return
        // 只用 LINE / Google 登入的帳號走同一個流程「設定」密碼（Better Auth 重設時會建立 credential 帳號）
        const [pw] = await db
          .select({ id: schema.account.id })
          .from(schema.account)
          .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, 'credential'), isNotNull(schema.account.password)))
          .limit(1)
        await mailer.send(resetPasswordMail(user.email, user.name, url, !!pw))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        if (isPlaceholderEmail(user.email)) return
        await mailer.send(verificationMail(user.email, user.name, url))
      },
    },
    socialProviders: socialProviders(env),
    account: {
      accountLinking: {
        enabled: true,
        // 用 email 自動合併到既有帳號時，第三方的 email 要已驗證（Google 看 email_verified；LINE 見 mapProfileToUser），
        // 既有帳號的 email 也必須已驗證（requireLocalEmailVerified 預設 true），避免有人先用別人的 email 註冊等著被合併。
        // LINE 列為信任：沒有 email 的 LINE 帳號（替代地址）才能在個人設定頁主動綁定；替代地址不會對上任何既有帳號
        trustedProviders: ['line'],
        // 個人設定頁主動綁定時（已登入），允許 LINE / Google 的 email 和帳號不同
        allowDifferentEmails: true,
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
        '/sign-in/social': { window: 60, max: 10 },
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
      // Better Auth 在測試環境預設略過來源與 callbackURL 檢查；明確開啟，讓測試和正式環境的行為一致
      disableOriginCheck: false,
      // 經 Cloudflare / Caddy 代理時，真實 IP 在 CF-Connecting-IP（限流用，回歸測試 R15）
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user']
