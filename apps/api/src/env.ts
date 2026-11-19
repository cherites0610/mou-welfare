import { z } from 'zod'

// 啟動時驗證環境變數；缺少必要值就拒絕啟動（v1 未設定 API_KEY 時驗證被繞過 → 回歸測試 R2）。
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(5030),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, '至少 32 字元'),
    BETTER_AUTH_URL: z.url(),
    /** 允許跨網域帶 cookie 的前端來源（逗號分隔） */
    TRUSTED_ORIGINS: z
      .string()
      .default('')
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
    /** 爬蟲推送的 HMAC 金鑰（services/scraper/src/scraper/push.py 用同一把簽章） */
    INGEST_HMAC_KEY: z.string().min(32, '至少 32 字元'),

    /** 福利結構化：gemini＝呼叫 Gemini；rules＝關鍵字規則（沒有金鑰時的備案）。未設定時有金鑰就用 gemini */
    LLM_DRIVER: z.enum(['gemini', 'rules']).optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),
    /** 背景工作的執行方式：inline＝在 API 程序內；separate＝由 src/worker.ts 獨立程序；off＝不執行（測試用） */
    WORKER_MODE: z.enum(['inline', 'separate', 'off']).default('inline'),

    /** 寄信：resend＝真的寄出；log＝只印在終端機（開發用） */
    MAIL_DRIVER: z.enum(['resend', 'log']).default('log'),
    RESEND_API_KEY: z.string().startsWith('re_').optional(),
    /** 寄件人。網域在 Resend 驗證前只能用 onboarding@resend.dev，且只能寄給 Resend 帳號本人 */
    EMAIL_FROM: z.string().default('哞福利 <onboarding@resend.dev>'),
    /** 登入、註冊、重設密碼的限流（R15） */
    RATE_LIMIT: z.enum(['on', 'off']).default('on'),

    /** 上傳檔案的儲存：r2＝Cloudflare R2（S3 相容 API）；none＝停用上傳（回傳 503） */
    STORAGE_DRIVER: z.enum(['r2', 'none']).default('none'),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    /** 上傳檔案對外的網址前綴，例如 https://files.mou-welfare.com */
    R2_PUBLIC_BASE_URL: z.url().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.MAIL_DRIVER === 'resend' && !e.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'MAIL_DRIVER=resend 時必填' })
    }
    if (e.LLM_DRIVER === 'gemini' && !e.GEMINI_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'LLM_DRIVER=gemini 時必填' })
    }
    if (e.STORAGE_DRIVER === 'r2') {
      for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'STORAGE_DRIVER=r2 時必填' })
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export class EnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(`環境變數錯誤：${missing.join('、')}`)
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.')}（${i.message}）`))
  }
  return result.data
}
