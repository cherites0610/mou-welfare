import { z } from 'zod'

// 啟動時驗證環境變數；缺少必要值就拒絕啟動（v1 未設定 API_KEY 時驗證被繞過 → 回歸測試 R2）。
const EnvSchema = z.object({
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
  INGEST_HMAC_KEY: z.string().min(32, '至少 32 字元'),
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
