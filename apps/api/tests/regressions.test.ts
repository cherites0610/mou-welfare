// v1 回歸測試（docs/testing.md §4.3）。尚未實作的功能以 todo 標記，實作時必須補上。
// R3、R4 在 welfare.test.ts；R5 在 packages/shared（age.test.ts、matching.test.ts）。
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { user } from '../src/db/schema/index.ts'
import { EnvError, loadEnv } from '../src/env.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'
import { testEnv } from './test-env.ts'

const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

describe('R2 必要的 secret 缺少時拒絕啟動', () => {
  const base = { ...testEnv() } as unknown as Record<string, string>
  const src = (patch: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries({ ...base, TRUSTED_ORIGINS: '', ...patch }).map(([k, v]) => [k, v === undefined ? undefined : String(v)]))

  it('未設定 INGEST_HMAC_KEY', () => {
    expect(() => loadEnv(src({ INGEST_HMAC_KEY: undefined }))).toThrow(EnvError)
    try {
      loadEnv(src({ INGEST_HMAC_KEY: undefined }))
    } catch (e) {
      expect((e as EnvError).missing.join()).toContain('INGEST_HMAC_KEY')
    }
  })
  it('INGEST_HMAC_KEY 過短', () => {
    expect(() => loadEnv(src({ INGEST_HMAC_KEY: 'short' }))).toThrow(EnvError)
  })
  it('未設定 BETTER_AUTH_SECRET', () => {
    expect(() => loadEnv(src({ BETTER_AUTH_SECRET: undefined }))).toThrow(EnvError)
  })
})

describe('R10 不能透過註冊端點寫入身分、角色等欄位', () => {
  it('註冊時夾帶 role / identities 不會生效', async () => {
    const { res } = await signUp(t.app, 'evil@example.com', { role: 'admin', identities: ['低收入戶'] })
    expect(res.status).toBe(200) // 註冊本身成功，多餘欄位被忽略
    const [row] = await t.db.select().from(user).where(eq(user.email, 'evil@example.com'))
    expect(row).toBeDefined()
    expect(row!.role).toBe('user')
    expect(row!.identities).toEqual([])
  })
})

describe.todo('R1 沒有 email 的 LINE 帳號登入不能取得既有使用者的 session（P4：LINE / LIFF）')
describe.todo('R6 帶非所屬家庭的 familyId 回傳 403（P1 / P3）')
describe.todo('R7 讀取、刪除、續聊他人的聊天 session 回傳 404（P3）')
describe.todo('R9 只能透過有效邀請碼加入家庭（P3）')
describe.todo('R11 LINE webhook 簽章錯誤回傳 401 且不排入工作（P4）')
describe.todo('R12 /v1/uploads 未登入 401、格式或大小不符 4xx（P1）')
describe.todo('R13 OAuth state 不符時拒絕登入（P4）')
describe.todo('R14 忘記密碼對已註冊與未註冊 email 回應相同（P1：串接 Resend）')
describe.todo('R15 驗證碼錯誤 N 次後鎖定，限流以 CF-Connecting-IP 計算（P1）')
