// 管理端（docs/backend.md §8.6）：權限、人工覆寫不被結構化蓋掉、稽核紀錄、統計。
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminAudit, llmCalls, user, welfarePrograms } from '../src/db/schema/index.ts'
import { LLMStructurer, type LLMStructuredWelfare } from '../src/features/welfare/structure.ts'
import { structureProgram } from '../src/jobs/structure.ts'
import { FakeLLM } from '../src/lib/llm/index.ts'
import { createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const t = setupApp()
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  t.queue.jobs.length = 0
})

const req = (path: string, cookie: string, init: RequestInit = {}) =>
  t.app.request(path, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers ?? {}) } })
const patch = (path: string, cookie: string, body: object) => req(path, cookie, { method: 'PATCH', body: JSON.stringify(body) })

async function admin(email = 'admin@example.com') {
  const { cookie } = await signUp(t, email)
  await t.db.update(user).set({ role: 'admin' }).where(eq(user.email, email))
  return cookie
}

const NOT_WELFARE: LLMStructuredWelfare = {
  isIndividualWelfare: false,
  name: '家暴相對人支持性服務',
  summary: '提供家暴相對人關懷與輔導等支持性服務。',
  categories: ['其他福利'],
  identityChecks: [],
  requirements: [],
  rewards: [],
  deadline: null,
}

describe('權限', () => {
  const paths = ['/v1/admin/overview', '/v1/admin/welfare', '/v1/admin/users', '/v1/admin/llm-usage', '/v1/admin/audit']

  it('未登入 401、一般使用者 403、管理者 200', async () => {
    const { cookie: normal } = await signUp(t, 'normal@example.com')
    const adminCookie = await admin()
    for (const p of paths) {
      expect((await t.app.request(p)).status, p).toBe(401)
      expect((await req(p, normal)).status, p).toBe(403)
      expect((await req(p, adminCookie)).status, p).toBe(200)
    }
  })

  it('Email 未驗證的管理者 403', async () => {
    const cookie = await admin()
    await t.db.update(user).set({ emailVerified: false }).where(eq(user.email, 'admin@example.com'))
    expect((await req('/v1/admin/overview', cookie)).status).toBe(403)
  })

  it('使用者不能透過 PATCH /v1/me 把自己改成管理者', async () => {
    const { cookie } = await signUp(t, 'normal@example.com')
    const res = await patch('/v1/me', cookie, { role: 'admin' })
    expect(res.status).toBe(400)
    const [u] = await t.db.select().from(user).where(eq(user.email, 'normal@example.com'))
    expect(u!.role).toBe('user')
  })
})

describe('福利人工修正', () => {
  it('判為非福利的改回可搜尋：立即生效、排入重新結構化、寫入稽核紀錄；之後 LLM 再判為否也不覆蓋', async () => {
    const cookie = await admin()
    const p = await createProgram(t.db, { status: 'rejected', name: '家暴相對人支持性服務方案', contentHash: 'h1' })

    const res = await patch(`/v1/admin/welfare/${p.id}`, cookie, { statusOverride: 'active', note: '是直接服務民眾的方案' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Json
    expect(body.data).toMatchObject({ status: 'active', statusOverride: 'active', reviewNote: '是直接服務民眾的方案' })
    expect(t.queue.jobs).toEqual([{ name: 'welfare-structure', data: { programId: p.id, force: true } }]) // 補 embedding
    expect(body.data.history[0]).toMatchObject({ action: 'welfare.update', adminEmail: 'admin@example.com' })

    // 重新結構化：LLM 仍判為非福利，但人工判定優先；也要產生 embedding 才搜尋得到
    const llm = new FakeLLM({ generate: () => NOT_WELFARE })
    expect(await structureProgram(t.db, new LLMStructurer(llm), llm, p.id, undefined, { force: true })).toBe('done')
    const [after] = await t.db.select().from(welfarePrograms).where(eq(welfarePrograms.id, p.id))
    expect(after!.status).toBe('active')
    expect(after!.embedding).not.toBeNull()
  })

  it('判為非福利：立刻從搜尋消失，結構化也不會改回來；取消覆寫則交給結構化重新判斷', async () => {
    const cookie = await admin()
    const p = await createProgram(t.db, { status: 'active', name: '法規彙編' })
    await patch(`/v1/admin/welfare/${p.id}`, cookie, { statusOverride: 'rejected' })
    const search = (await (await t.app.request('/v1/welfare')).json()) as Json
    expect(search.data).toHaveLength(0)

    const res = await patch(`/v1/admin/welfare/${p.id}`, cookie, { statusOverride: null })
    expect(((await res.json()) as Json).data.statusOverride).toBeNull()
    expect(t.queue.jobs.at(-1)).toEqual({ name: 'welfare-structure', data: { programId: p.id, force: true } })
  })

  it('已過截止日的人工判為福利仍是 expired', async () => {
    const cookie = await admin()
    const p = await createProgram(t.db, { status: 'rejected', deadline: '2020-01-01' })
    const body = (await (await patch(`/v1/admin/welfare/${p.id}`, cookie, { statusOverride: 'active' })).json()) as Json
    expect(body.data.status).toBe('expired')
  })

  it('置頂、單筆重新結構化；列表可依狀態與縣市篩選', async () => {
    const cookie = await admin()
    const a = await createProgram(t.db, { status: 'rejected', city: '屏東縣' })
    await createProgram(t.db, { status: 'active', city: '屏東縣' })
    await createProgram(t.db, { status: 'rejected', city: '臺北市' })

    const list = (await (await req('/v1/admin/welfare?status=rejected&city=屏東縣', cookie)).json()) as Json
    expect(list.data.map((r: { id: string }) => r.id)).toEqual([a.id])
    expect(list.meta.total).toBe(1)

    const pinned = (await (await patch(`/v1/admin/welfare/${a.id}`, cookie, { pinned: true })).json()) as Json
    expect(pinned.data.pinnedAt).not.toBeNull()
    expect((await req(`/v1/admin/welfare/${a.id}/restructure`, cookie, { method: 'POST' })).status).toBe(202)
    const actions = (await t.db.select().from(adminAudit)).map((r) => r.action)
    expect(actions).toEqual(['welfare.update', 'welfare.restructure'])
  })

  it('空的修改 400、不存在 404', async () => {
    const cookie = await admin()
    const p = await createProgram(t.db)
    expect((await patch(`/v1/admin/welfare/${p.id}`, cookie, {})).status).toBe(400)
    expect((await patch('/v1/admin/welfare/00000000-0000-4000-8000-000000000000', cookie, { pinned: true })).status).toBe(404)
  })
})

describe('使用者（唯讀）', () => {
  it('列表不含生日與身分；查看詳情才有，並寫入稽核紀錄', async () => {
    const cookie = await admin()
    await signUp(t, 'alice@example.com')
    await t.db.update(user).set({ birthday: '1950-01-02', identities: ['中低收入戶'] }).where(eq(user.email, 'alice@example.com'))

    const list = (await (await req('/v1/admin/users?q=alice', cookie)).json()) as Json
    expect(list.data).toHaveLength(1)
    expect(list.data[0]).not.toHaveProperty('birthday')
    expect(list.data[0]).not.toHaveProperty('identities')
    expect(list.data[0].providers).toEqual(['credential'])
    expect(await t.db.select().from(adminAudit)).toHaveLength(0)

    const detail = (await (await req(`/v1/admin/users/${list.data[0].id}`, cookie)).json()) as Json
    expect(detail.data).toMatchObject({ email: 'alice@example.com', birthday: '1950-01-02', identities: ['中低收入戶'], favorites: 0 })
    const [log] = await t.db.select().from(adminAudit)
    expect(log).toMatchObject({ action: 'user.view', targetType: 'user', targetId: list.data[0].id, adminEmail: 'admin@example.com' })
  })
})

describe('總覽與用量', () => {
  it('各縣市數量、結構化狀態、LLM 費用、使用者數', async () => {
    const cookie = await admin()
    await createProgram(t.db, { city: '屏東縣', status: 'active', structuredBy: 'llm' })
    await createProgram(t.db, { city: '屏東縣', status: 'rejected', structuredBy: 'llm' })
    await createProgram(t.db, { city: '臺北市', status: 'active', structuredBy: 'rules' })
    await t.db.insert(llmCalls).values({ purpose: 'structure', model: 'gemini-3.5-flash-lite', inputTokens: 1000, outputTokens: 100, inputChars: 1200, latencyMs: 1000, ok: true, costUsd: 0.00055 })

    const o = ((await (await req('/v1/admin/overview', cookie)).json()) as Json).data
    expect(o.welfare.byCity[0]).toEqual({ city: '屏東縣', active: 1, rejected: 1, expired: 0, pending: 0 })
    expect(o.welfare.structure).toMatchObject({ llm: 2, rules: 1 })
    expect(o.llm.total).toMatchObject({ calls: 1, inputTokens: 1000, costUsd: 0.00055 })
    expect(o.llm.paused).toBeNull()
    expect(o.users.total).toBe(1)

    const u = ((await (await req('/v1/admin/llm-usage?days=7', cookie)).json()) as Json).data
    expect(u.rows[0]).toMatchObject({ purpose: 'structure', model: 'gemini-3.5-flash-lite', calls: 1, inputTokens: 1000 })
  })
})
