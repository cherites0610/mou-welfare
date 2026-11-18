// 權限矩陣 + 路由普查（docs/testing.md §4.2）
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { accessFor, ROUTE_ACCESS } from '../src/access.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

describe('路由普查', () => {
  const registered = Object.keys(ROUTE_ACCESS).map((k) => {
    const [method, path] = k.split(' ') as [string, string]
    return { method, path, key: k }
  })
  const appRoutes = t.app.routes.filter((r) => !(r.method === 'ALL' && (r.path === '/*' || r.path === '*')))

  it('每個已註冊的路由都在 ROUTE_ACCESS 登記（新增路由忘了登記就會失敗）', () => {
    const missing = appRoutes
      .filter((r) => !registered.some((x) => x.path === r.path && (x.method === '*' || x.method === r.method)))
      .map((r) => `${r.method} ${r.path}`)
    expect(missing).toEqual([])
  })

  it('ROUTE_ACCESS 沒有已不存在的路由', () => {
    const stale = registered
      .filter((x) => !appRoutes.some((r) => r.path === x.path && (x.method === '*' || x.method === r.method)))
      .map((x) => x.key)
    expect(stale).toEqual([])
  })
})

describe('accessFor：預設拒絕', () => {
  it.each([
    ['GET', '/health', 'public'],
    ['POST', '/v1/auth/sign-in/email', 'public'],
    ['GET', '/v1/me', 'user'],
    ['GET', '/v1/not-registered', 'user'],
    ['DELETE', '/v1/faq', 'user'],
  ] as const)('%s %s → %s', (method, path, expected) => {
    expect(accessFor(method, path)).toBe(expected)
  })
})

describe('權限矩陣', () => {
  // route, anon, user
  const matrix = [
    ['GET', '/health', 200, 200],
    ['GET', '/openapi.json', 200, 200],
    ['GET', '/v1/faq', 200, 200],
    ['GET', '/v1/me', 401, 200],
    ['GET', '/v1/not-registered', 401, 404], // 未登記：匿名 401，登入後才看到 404
  ] as const

  it.each(matrix)('%s %s：匿名 %i / 登入 %i', async (method, path, anon, user) => {
    expect((await t.app.request(path, { method })).status).toBe(anon)
    const { cookie } = await signUp(t.app)
    expect((await t.app.request(path, { method, headers: { cookie } })).status).toBe(user)
  })
})
