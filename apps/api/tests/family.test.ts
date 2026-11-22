// 家庭、成員、邀請碼、家庭模式的資格比對（docs/testing.md §4.2 權限矩陣、§4.3 R6 / R8 / R9）
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { familyInvites, user } from '../src/db/schema/index.ts'
import { MAX_MEMBERS_PER_FAMILY } from '../src/features/family/service.ts'
import type { MemoryStorage } from '../src/lib/storage.ts'
import { createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const json = async (res: Response): Promise<Json> => res.json()

const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

function call(method: string, path: string, cookie?: string, body?: object) {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = cookie
  if (body) headers['content-type'] = 'application/json'
  return t.app.request(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
}

type Person = { cookie: string; id: string; email: string }

async function person(email: string, profile?: object): Promise<Person> {
  const { cookie } = await signUp(t, email)
  if (profile) expect((await call('PATCH', '/v1/me', cookie, profile)).status).toBe(200)
  const [row] = await t.db.select({ id: user.id }).from(user).where(eq(user.email, email))
  return { cookie, id: row!.id, email }
}

async function createFamily(admin: Person, name = '王家'): Promise<string> {
  const res = await call('POST', '/v1/families', admin.cookie, { name })
  expect(res.status).toBe(201)
  return (await json(res)).data.id
}

async function invite(admin: Person, familyId: string): Promise<string> {
  const res = await call('POST', `/v1/families/${familyId}/invites`, admin.cookie)
  expect(res.status).toBe(201)
  return (await json(res)).data.code
}

async function join(p: Person, code: string) {
  return call('POST', `/v1/invites/${code}/accept`, p.cookie)
}

/** 管理者 admin、成員 member、外人 outsider，同在一個家庭（outsider 除外） */
async function household() {
  const admin = await person('admin@example.com')
  const member = await person('member@example.com')
  const outsider = await person('outsider@example.com')
  const familyId = await createFamily(admin)
  expect((await join(member, await invite(admin, familyId))).status).toBe(200)
  return { admin, member, outsider, familyId }
}

describe('權限矩陣：家庭', () => {
  // route, anon, outsider, member, admin（R8：只有管理者能修改或刪除）
  const matrix = [
    ['GET', '/v1/families/:id', undefined, 401, 403, 200, 200],
    ['PATCH', '/v1/families/:id', { name: '新名字' }, 401, 403, 403, 200],
    ['GET', '/v1/families/:id/members', undefined, 401, 403, 200, 200],
    ['POST', '/v1/families/:id/invites', undefined, 401, 403, 403, 201],
    ['DELETE', '/v1/families/:id', undefined, 401, 403, 403, 204],
  ] as const

  it.each(matrix)('%s %s：匿名 %i / 外人 %i / 成員 %i / 管理者 %i', async (method, route, body, anon, out, mem, adm) => {
    const h = await household()
    const path = route.replace(':id', h.familyId)
    expect((await call(method, path, undefined, body)).status).toBe(anon)
    expect((await call(method, path, h.outsider.cookie, body)).status).toBe(out)
    expect((await call(method, path, h.member.cookie, body)).status).toBe(mem)
    expect((await call(method, path, h.admin.cookie, body)).status).toBe(adm)
  })

  it('外人收到的 403 不含任何家庭或成員資料', async () => {
    const h = await household()
    const text = await (await call('GET', `/v1/families/${h.familyId}`, h.outsider.cookie)).text()
    expect(text).not.toContain('王家')
    expect(text).not.toContain(h.member.id)
  })

  it('成員不能修改他人角色或移除他人；管理者可以', async () => {
    const h = await household()
    const roleOf = (who: Person, role: string) =>
      call('PATCH', `/v1/families/${h.familyId}/members/${who.id}`, h.member.cookie, { role })
    expect((await roleOf(h.member, 'admin')).status).toBe(403) // 不能自己升級
    expect((await call('DELETE', `/v1/families/${h.familyId}/members/${h.admin.id}`, h.member.cookie)).status).toBe(403)
    expect((await call('DELETE', `/v1/families/${h.familyId}/members/${h.member.id}`, h.admin.cookie)).status).toBe(204)
    expect((await call('GET', `/v1/families/${h.familyId}`, h.member.cookie)).status).toBe(403)
  })

  it('外人不能修改成員角色', async () => {
    const h = await household()
    const res = await call('PATCH', `/v1/families/${h.familyId}/members/${h.outsider.id}`, h.outsider.cookie, { role: 'admin' })
    expect(res.status).toBe(403)
  })
})

describe('建立與查看家庭', () => {
  it('建立者成為管理者；列表只有自己加入的家庭', async () => {
    const a = await person('a@example.com')
    const b = await person('b@example.com')
    await createFamily(a, '王家')
    await createFamily(b, '李家')
    const body = await json(await call('GET', '/v1/families', a.cookie))
    expect(body.data.map((f: { name: string }) => f.name)).toEqual(['王家'])
    expect(body.data[0].myRole).toBe('admin')
    expect(body.data[0].members).toEqual([expect.objectContaining({ userId: a.id, role: 'admin', name: '測試使用者' })])
  })

  it('成員資料只有姓名、頭像與角色，不含生日、身分、email', async () => {
    const h = await household()
    await call('PATCH', '/v1/me', h.admin.cookie, { birthday: '1950-01-01', identities: ['低收入戶'] })
    const body = await json(await call('GET', `/v1/families/${h.familyId}`, h.member.cookie))
    expect(Object.keys(body.data.members[0]).sort()).toEqual(['image', 'joinedAt', 'name', 'role', 'userId'])
    expect(JSON.stringify(body)).not.toContain('admin@example.com')
  })

  it('名稱空白、過長或帶多餘欄位回傳 400', async () => {
    const a = await person('a@example.com')
    expect((await call('POST', '/v1/families', a.cookie, { name: '  ' })).status).toBe(400)
    expect((await call('POST', '/v1/families', a.cookie, { name: '家'.repeat(31) })).status).toBe(400)
    expect((await call('POST', '/v1/families', a.cookie, { name: '王家', createdBy: 'x' })).status).toBe(400)
  })

  it('改名與刪除', async () => {
    const h = await household()
    const res = await call('PATCH', `/v1/families/${h.familyId}`, h.admin.cookie, { name: '王家（新）' })
    expect((await json(res)).data.name).toBe('王家（新）')
    expect((await call('DELETE', `/v1/families/${h.familyId}`, h.admin.cookie)).status).toBe(204)
    expect((await json(await call('GET', '/v1/families', h.member.cookie))).data).toEqual([])
  })
})

describe('R9 只能透過有效邀請碼加入家庭', () => {
  it('建立家庭 → 產生邀請碼 → 另一個帳號加入：兩人都看得到家庭', async () => {
    const h = await household()
    for (const p of [h.admin, h.member]) {
      const body = await json(await call('GET', '/v1/families', p.cookie))
      expect(body.data[0].members.map((m: { userId: string }) => m.userId)).toEqual([h.admin.id, h.member.id])
    }
    const mine = await json(await call('GET', '/v1/families', h.member.cookie))
    expect(mine.data[0].myRole).toBe('member')
  })

  it('邀請碼不分大小寫，可夾雜空白或連字號', async () => {
    const admin = await person('admin@example.com')
    const b = await person('b@example.com')
    const familyId = await createFamily(admin)
    const code = await invite(admin, familyId)
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`
    expect((await join(b, encodeURIComponent(typed))).status).toBe(200)
  })

  it('邀請碼不存在回傳 404', async () => {
    const b = await person('b@example.com')
    expect((await join(b, 'ZZZZZZZZ')).status).toBe(404)
    expect((await call('GET', '/v1/invites/ZZZZZZZZ', b.cookie)).status).toBe(404)
  })

  it('邀請碼只能使用一次：第二個人回傳 410', async () => {
    const admin = await person('admin@example.com')
    const [b, c] = [await person('b@example.com'), await person('c@example.com')]
    const code = await invite(admin, await createFamily(admin))
    expect((await join(b, code)).status).toBe(200)
    const res = await join(c, code)
    expect(res.status).toBe(410)
    expect((await json(res)).error.code).toBe('gone')
  })

  it('同一個邀請碼同時被兩個人使用時，只有一個人加入', async () => {
    const admin = await person('admin@example.com')
    const [b, c] = [await person('b@example.com'), await person('c@example.com')]
    const familyId = await createFamily(admin)
    const code = await invite(admin, familyId)
    const statuses = (await Promise.all([join(b, code), join(c, code)])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 410])
    const members = await json(await call('GET', `/v1/families/${familyId}/members`, admin.cookie))
    expect(members.data).toHaveLength(2)
  })

  it('邀請碼過期回傳 410', async () => {
    const admin = await person('admin@example.com')
    const b = await person('b@example.com')
    const code = await invite(admin, await createFamily(admin))
    await t.db.update(familyInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(familyInvites.code, code))
    expect((await join(b, code)).status).toBe(410)
    expect((await call('GET', `/v1/invites/${code}`, b.cookie)).status).toBe(410)
  })

  it('已經是成員時回傳 409，且不消耗邀請碼', async () => {
    const h = await household()
    const code = await invite(h.admin, h.familyId)
    expect((await join(h.member, code)).status).toBe(409)
    expect((await join(h.outsider, code)).status).toBe(200)
  })

  it('未登入不能查看或使用邀請碼', async () => {
    const admin = await person('admin@example.com')
    const code = await invite(admin, await createFamily(admin))
    expect((await call('GET', `/v1/invites/${code}`)).status).toBe(401)
    expect((await call('POST', `/v1/invites/${code}/accept`)).status).toBe(401)
  })

  it('預覽只有家庭名稱與人數，不含成員資料，也不消耗邀請碼', async () => {
    const h = await household()
    const code = await invite(h.admin, h.familyId)
    const body = await json(await call('GET', `/v1/invites/${code}`, h.outsider.cookie))
    expect(body.data).toEqual(
      expect.objectContaining({ familyId: h.familyId, familyName: '王家', memberCount: 2, alreadyMember: false }),
    )
    expect(JSON.stringify(body)).not.toContain(h.admin.id)
    expect((await join(h.outsider, code)).status).toBe(200)
  })

  it('家庭人數達上限時回傳 409', async () => {
    const admin = await person('admin@example.com')
    const familyId = await createFamily(admin)
    for (let i = 1; i < MAX_MEMBERS_PER_FAMILY; i++) {
      expect((await join(await person(`m${i}@example.com`), await invite(admin, familyId))).status).toBe(200)
    }
    const res = await join(await person('late@example.com'), await invite(admin, familyId))
    expect(res.status).toBe(409)
  }, 60_000)
})

describe('成員角色與退出', () => {
  it('最後一位管理者不能降級或退出；先指定其他管理者後就可以', async () => {
    const h = await household()
    const base = `/v1/families/${h.familyId}/members`
    expect((await call('PATCH', `${base}/${h.admin.id}`, h.admin.cookie, { role: 'member' })).status).toBe(409)
    expect((await call('DELETE', `${base}/${h.admin.id}`, h.admin.cookie)).status).toBe(409)
    expect((await call('PATCH', `${base}/${h.member.id}`, h.admin.cookie, { role: 'admin' })).status).toBe(200)
    expect((await call('DELETE', `${base}/${h.admin.id}`, h.admin.cookie)).status).toBe(204)
    const body = await json(await call('GET', `/v1/families/${h.familyId}`, h.member.cookie))
    expect(body.data.members).toEqual([expect.objectContaining({ userId: h.member.id, role: 'admin' })])
  })

  it('成員可以自己退出', async () => {
    const h = await household()
    expect((await call('DELETE', `/v1/families/${h.familyId}/members/${h.member.id}`, h.member.cookie)).status).toBe(204)
    expect((await json(await call('GET', '/v1/families', h.member.cookie))).data).toEqual([])
  })

  it('最後一位成員退出時刪除家庭', async () => {
    const a = await person('a@example.com')
    const familyId = await createFamily(a)
    expect((await call('DELETE', `/v1/families/${familyId}/members/${a.id}`, a.cookie)).status).toBe(204)
    expect((await call('GET', `/v1/families/${familyId}`, a.cookie)).status).toBe(403)
  })

  it('對象不是成員時回傳 404；角色不在白名單回傳 400', async () => {
    const h = await household()
    const base = `/v1/families/${h.familyId}/members`
    expect((await call('PATCH', `${base}/${h.outsider.id}`, h.admin.cookie, { role: 'admin' })).status).toBe(404)
    expect((await call('DELETE', `${base}/${h.outsider.id}`, h.admin.cookie)).status).toBe(404)
    expect((await call('PATCH', `${base}/${h.member.id}`, h.admin.cookie, { role: 'owner' })).status).toBe(400)
  })
})

describe('R6 家庭模式的資格比對', () => {
  async function seniorFamily() {
    const admin = await person('admin@example.com', { birthday: '1990-01-01' })
    const grandma = await person('grandma@example.com', { birthday: '1950-01-01', identities: ['低收入戶'] })
    const outsider = await person('outsider@example.com')
    const familyId = await createFamily(admin)
    expect((await join(grandma, await invite(admin, familyId))).status).toBe(200)
    return { admin, grandma, outsider, familyId }
  }

  it('帶非所屬家庭的 familyId 回傳 403，回應不含該家庭成員的姓名或頭像', async () => {
    const f = await seniorFamily()
    await t.db.update(user).set({ name: '王阿嬤', image: 'https://files.test/avatars/grandma.webp' }).where(eq(user.id, f.grandma.id))
    const p = await createProgram(t.db, { identities: ['65歲以上'] })
    for (const path of [`/v1/welfare?familyId=${f.familyId}`, `/v1/welfare/${p.id}?familyId=${f.familyId}`, `/v1/me/favorites?familyId=${f.familyId}`]) {
      const res = await call('GET', path, f.outsider.cookie)
      expect(res.status).toBe(403)
      const text = await res.text()
      expect(text).not.toContain('王阿嬤')
      expect(text).not.toContain('grandma.webp')
    }
  })

  it('未登入帶 familyId 回傳 401', async () => {
    const f = await seniorFamily()
    expect((await call('GET', `/v1/welfare?familyId=${f.familyId}`)).status).toBe(401)
  })

  it('成員看到家人（不含自己）的比對結果，且家人可能符合的福利排前面', async () => {
    const f = await seniorFamily()
    await createProgram(t.db, { name: '身障福利', identities: ['身心障礙者'], publishedAt: '2026-10-01' })
    await createProgram(t.db, { name: '老人福利', identities: ['65歲以上'], publishedAt: '2026-01-01' })
    const plain = await json(await call('GET', '/v1/welfare', f.admin.cookie))
    expect(plain.data.map((x: { name: string }) => x.name)).toEqual(['身障福利', '老人福利'])
    expect(plain.data[0].familyMatches).toBeNull()

    const body = await json(await call('GET', `/v1/welfare?familyId=${f.familyId}`, f.admin.cookie))
    expect(body.data.map((x: { name: string }) => x.name)).toEqual(['老人福利', '身障福利'])
    const senior = body.data.find((x: { name: string }) => x.name === '老人福利')
    expect(senior.match.light).toBe('RED') // 本人 36 歲
    expect(senior.familyMatches).toEqual([
      { userId: f.grandma.id, name: '測試使用者', image: null, match: expect.objectContaining({ light: 'GREEN' }) },
    ])
    // 家人資料不外流：沒有生日或身分欄位
    expect(Object.keys(senior.familyMatches[0]).sort()).toEqual(['image', 'match', 'name', 'userId'])
  })

  it('詳情與收藏也附上家人的比對結果', async () => {
    const f = await seniorFamily()
    const p = await createProgram(t.db, { identities: ['低收入戶'] })
    const detail = await json(await call('GET', `/v1/welfare/${p.id}?familyId=${f.familyId}`, f.admin.cookie))
    expect(detail.data.familyMatches[0].match.light).toBe('GREEN')
    await call('PUT', `/v1/me/favorites/${p.id}`, f.admin.cookie)
    const favs = await json(await call('GET', `/v1/me/favorites?familyId=${f.familyId}`, f.admin.cookie))
    expect(favs.data[0].familyMatches[0].userId).toBe(f.grandma.id)
  })

  it('退出家庭後就不能再用家庭模式', async () => {
    const f = await seniorFamily()
    await call('DELETE', `/v1/families/${f.familyId}/members/${f.grandma.id}`, f.grandma.cookie)
    expect((await call('GET', `/v1/welfare?familyId=${f.familyId}`, f.grandma.cookie)).status).toBe(403)
  })
})

describe('DELETE /v1/me 刪除帳號', () => {
  const confirm = { confirm: 'DELETE' }

  it('沒有確認字串時回傳 400，帳號不受影響', async () => {
    const a = await person('a@example.com')
    expect((await call('DELETE', '/v1/me', a.cookie)).status).toBe(400)
    expect((await call('DELETE', '/v1/me', a.cookie, { confirm: 'yes' })).status).toBe(400)
    expect((await call('GET', '/v1/me', a.cookie)).status).toBe(200)
  })

  it('刪除後 session 失效、無法再登入，收藏也一併刪除', async () => {
    const a = await person('a@example.com')
    const p = await createProgram(t.db)
    await call('PUT', `/v1/me/favorites/${p.id}`, a.cookie)
    expect((await call('DELETE', '/v1/me', a.cookie, confirm)).status).toBe(204)
    expect((await call('GET', '/v1/me', a.cookie)).status).toBe(401)
    expect(await t.db.select().from(user).where(eq(user.email, a.email))).toEqual([])
    const { login } = await signUp(t, 'other@example.com') // 確認登入流程本身正常
    expect(login.status).toBe(200)
  })

  it('唯一管理者刪除帳號：最早加入的成員成為管理者；只剩自己的家庭直接刪除', async () => {
    const h = await household()
    const solo = await createFamily(h.admin, '只有我')
    expect((await call('DELETE', '/v1/me', h.admin.cookie, confirm)).status).toBe(204)
    const body = await json(await call('GET', '/v1/families', h.member.cookie))
    expect(body.data).toHaveLength(1)
    expect(body.data[0].myRole).toBe('admin')
    expect(body.data[0].members).toEqual([expect.objectContaining({ userId: h.member.id })])
    expect((await call('GET', `/v1/families/${solo}`, h.member.cookie)).status).toBe(403)
  })

  it('一併刪除上傳的頭像', async () => {
    const a = await person('a@example.com')
    const url = await t.storage!.put(`avatars/${a.id}/x.webp`, new Uint8Array([1]), 'image/webp')
    await t.db.update(user).set({ image: url }).where(eq(user.id, a.id))
    expect((await call('DELETE', '/v1/me', a.cookie, confirm)).status).toBe(204)
    expect((t.storage as MemoryStorage).objects.has(`avatars/${a.id}/x.webp`)).toBe(false)
  })
})
