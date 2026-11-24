import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NATIONAL } from '@mou-welfare/shared'
import { syncCurated } from '../src/jobs/curated.ts'
import { structureProgram } from '../src/jobs/structure.ts'
import { RuleStructurer } from '../src/features/welfare/structure.ts'
import { welfarePrograms } from '../src/db/schema/index.ts'
import { addAttachment, createProgram } from './factories.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

type Json = any
const json = async (res: Response): Promise<Json> => res.json()

const t = setupApp()
afterAll(() => t.close())
beforeEach(() => resetDb(t.db))

const get = (path: string, cookie?: string) => t.app.request(path, cookie ? { headers: { cookie } } : {})
const names = (body: Json) => body.data.map((x: { name: string }) => x.name)

async function signUpWithProfile(profile: object) {
  const { cookie } = await signUp(t, `u${Math.random()}@example.com`)
  const res = await t.app.request('/v1/me', {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  })
  expect(res.status).toBe(200)
  return cookie
}

describe('GET /v1/welfare 篩選', () => {
  it('R3 多類別福利以任一類別篩選都找得到', async () => {
    await createProgram(t.db, { name: '多類別福利', categories: ['老人福利', '社會救助福利'] })
    await createProgram(t.db, { name: '兒少福利', categories: ['兒童及青少年福利'] })
    expect(names(await json(await get('/v1/welfare?category=老人福利')))).toEqual(['多類別福利'])
    expect(names(await json(await get('/v1/welfare?category=社會救助福利')))).toEqual(['多類別福利'])
    expect(names(await json(await get(`/v1/welfare?category=${encodeURIComponent('老人福利,兒童及青少年福利')}`))).sort()).toEqual(
      ['兒少福利', '多類別福利'].sort(),
    )
  })

  it('縣市篩選', async () => {
    await createProgram(t.db, { name: '金門的', city: '金門縣' })
    await createProgram(t.db, { name: '基隆的', city: '基隆市' })
    expect(names(await json(await get('/v1/welfare?city=基隆市')))).toEqual(['基隆的'])
  })

  it('中文關鍵字搜尋名稱與摘要，% 與 _ 視為一般字元', async () => {
    await createProgram(t.db, { name: '中低收入老人生活津貼' })
    await createProgram(t.db, { name: '其他', summary: '提供老人健保費補助' })
    await createProgram(t.db, { name: '100%補助' })
    expect(names(await json(await get('/v1/welfare?q=老人'))).sort()).toEqual(['中低收入老人生活津貼', '其他'].sort())
    expect(names(await json(await get(`/v1/welfare?q=${encodeURIComponent('%')}`)))).toEqual(['100%補助'])
  })

  it('只列出 active 狀態', async () => {
    await createProgram(t.db, { name: '有效' })
    await createProgram(t.db, { name: '已過期', status: 'expired' })
    await createProgram(t.db, { name: '已下架', status: 'removed' })
    expect(names(await json(await get('/v1/welfare')))).toEqual(['有效'])
  })

  it('不支援的縣市或類別回傳 400', async () => {
    expect((await get('/v1/welfare?city=火星')).status).toBe(400)
    expect((await get('/v1/welfare?category=不存在')).status).toBe(400)
    expect((await get('/v1/welfare?limit=500')).status).toBe(400)
  })

  it('分頁與總數', async () => {
    for (let i = 0; i < 5; i++) await createProgram(t.db, { name: `福利${i}`, publishedAt: `2026-01-0${i + 1}` })
    const p2 = await json(await get('/v1/welfare?limit=2&page=2'))
    expect(p2.meta).toEqual({ page: 2, limit: 2, total: 5 })
    expect(names(p2)).toEqual(['福利2', '福利1'])
    expect((await json(await get('/v1/welfare?limit=2&page=9'))).data).toEqual([])
  })
})

describe('GET /v1/welfare 排序與資格比對', () => {
  it('R4 有身分限制的福利排在前面，其次依發布日期新到舊', async () => {
    await createProgram(t.db, { name: '無限制-新', identities: [], publishedAt: '2026-10-01' })
    await createProgram(t.db, { name: '有限制-舊', identities: ['原住民'], publishedAt: '2020-01-01' })
    await createProgram(t.db, { name: '無限制-舊', identities: [], publishedAt: '2021-01-01' })
    expect(names(await json(await get('/v1/welfare')))).toEqual(['有限制-舊', '無限制-新', '無限制-舊'])
  })

  it('置頂的福利排最前面（越晚置頂越前面），但仍受篩選條件限制', async () => {
    await createProgram(t.db, { name: '一般', identities: ['原住民'], publishedAt: '2026-10-01' })
    await createProgram(t.db, { name: '置頂-早', pinnedAt: new Date('2026-01-01') })
    await createProgram(t.db, { name: '置頂-晚', pinnedAt: new Date('2026-02-01'), city: '臺北市' })
    expect(names(await json(await get('/v1/welfare')))).toEqual(['置頂-晚', '置頂-早', '一般'])
    expect(names(await json(await get('/v1/welfare?city=金門縣')))).toEqual(['置頂-早', '一般'])
  })

  it('未登入時沒有比對結果', async () => {
    await createProgram(t.db)
    expect((await json(await get('/v1/welfare'))).data[0].match).toBeNull()
  })

  it('登入時附上比對結果，且使用者可能符合的排前面（含相容身分）', async () => {
    await createProgram(t.db, { name: '榮民福利', identities: ['榮民'], publishedAt: '2026-10-01' })
    await createProgram(t.db, { name: '中低收入福利', identities: ['中低收入戶'], publishedAt: '2020-01-01' })
    const cookie = await signUpWithProfile({ identities: ['低收入戶'] })
    const body = await json(await get('/v1/welfare', cookie))
    expect(names(body)).toEqual(['中低收入福利', '榮民福利'])
    expect(body.data[0].match.light).toBe('GREEN')
    expect(body.data[1].match.light).toBe('RED')
  })
})

describe('GET /v1/welfare/:id', () => {
  it('回傳詳情與附件；未登入時 isFavorite 與 match 為 null', async () => {
    const p = await createProgram(t.db, { name: '詳情測試', requirements: ['設籍滿一年'] })
    await addAttachment(t.db, p.id)
    const body = await json(await get(`/v1/welfare/${p.id}`))
    expect(body.data).toMatchObject({
      name: '詳情測試',
      requirements: ['設籍滿一年'],
      attachments: [{ name: '申請表.pdf' }],
      isFavorite: null,
      match: null,
      expired: false,
    })
  })

  it('已過期仍可查看並標示 expired；待整理、雜訊、已下架回傳 404', async () => {
    const expired = await createProgram(t.db, { status: 'expired' })
    expect((await json(await get(`/v1/welfare/${expired.id}`))).data.expired).toBe(true)
    for (const status of ['pending', 'rejected', 'removed'] as const) {
      const p = await createProgram(t.db, { status })
      expect((await get(`/v1/welfare/${p.id}`)).status).toBe(404)
    }
  })

  it('不存在回傳 404；id 格式錯誤回傳 400', async () => {
    expect((await get('/v1/welfare/00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await get('/v1/welfare/not-a-uuid')).status).toBe(400)
  })
})

describe('GET /v1/sitemap', () => {
  it('只列上架中的福利', async () => {
    const active = await createProgram(t.db)
    for (const status of ['pending', 'rejected', 'expired', 'removed'] as const) await createProgram(t.db, { status })
    const res = await get('/v1/sitemap')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('max-age')
    const body = await json(res)
    expect(body.data.map((x: { id: string }) => x.id)).toEqual([active.id])
    expect(Number.isNaN(Date.parse(body.data[0].updatedAt))).toBe(false)
  })
})

describe('主題（topic）', () => {
  it('依主題關鍵字比對名稱與摘要', async () => {
    const a = await createProgram(t.db, { name: '生育津貼' })
    const b = await createProgram(t.db, { name: '弱勢家庭補助', summary: '懷孕期間每月補助' })
    await createProgram(t.db, { name: '老人假牙補助' })
    const body = await json(await get('/v1/welfare?topic=pregnancy'))
    expect(body.data.map((x: { id: string }) => x.id).sort()).toEqual([a.id, b.id].sort())
    expect(body.meta.total).toBe(2)
  })

  it('不支援的主題回 400', async () => {
    expect((await get('/v1/welfare?topic=unknown')).status).toBe(400)
  })

  it('GET /v1/topics：縣市 × 類別與主題的筆數，只算上架中', async () => {
    await createProgram(t.db, { city: '臺北市', categories: ['老人福利', '身心障礙福利'], name: '輔具補助' })
    await createProgram(t.db, { city: '臺北市', categories: ['老人福利'] })
    await createProgram(t.db, { city: '新北市', categories: ['老人福利'], name: '輔具租借', status: 'rejected' })
    const res = await get('/v1/topics')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('max-age')
    const { data } = await json(res)
    expect(data.cities).toEqual([{ city: '臺北市', total: 2, categories: { 老人福利: 2, 身心障礙福利: 1 } }])
    expect(data.topics.find((x: { slug: string }) => x.slug === 'assistive-devices').total).toBe(1)
    expect(data.topics.find((x: { slug: string }) => x.slug === 'funeral').total).toBe(0)
  })
})

describe('全國性福利與精選', () => {
  it('依縣市篩選時一併列出全國性福利；只篩全國時只列全國', async () => {
    const tp = await createProgram(t.db, { city: '臺北市' })
    const nat = await createProgram(t.db, { city: NATIONAL })
    await createProgram(t.db, { city: '新北市' })
    const ids = async (q: string) => (await json(await get(`/v1/welfare?${q}`))).data.map((x: { id: string }) => x.id).sort()
    expect(await ids(`city=${encodeURIComponent('臺北市')}`)).toEqual([tp.id, nat.id].sort())
    expect(await ids(`city=${encodeURIComponent(NATIONAL)}`)).toEqual([nat.id])
  })

  it('GET /v1/topics：全國性福利另列，不算進縣市', async () => {
    await createProgram(t.db, { city: NATIONAL, categories: ['老人福利'] })
    const { data } = await json(await get('/v1/topics'))
    expect(data.cities).toEqual([])
    expect(data.national).toEqual({ total: 1, categories: { 老人福利: 1 } })
  })

  it('GET /v1/highlights：置頂的精選與 30 天內截止的', async () => {
    const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
    const pinned = await createProgram(t.db, { pinnedAt: new Date() })
    await createProgram(t.db, { pinnedAt: new Date(), status: 'expired' })
    const soon = await createProgram(t.db, { deadline: day(5) })
    const sooner = await createProgram(t.db, { deadline: day(1) })
    await createProgram(t.db, { deadline: day(60) })
    await createProgram(t.db, { deadline: day(-1) })
    const { data } = await json(await get('/v1/highlights'))
    expect(data.featured.map((x: { id: string }) => x.id)).toEqual([pinned.id])
    expect(data.closingSoon.map((x: { id: string }) => x.id)).toEqual([sooner.id, soon.id])
  })

  it('精選福利同步：判為福利、精選的置頂；內容沒變不重新結構化；從清單移除的下架', async () => {
    const item = {
      slug: 'demo',
      title: '示範的全國性福利',
      city: NATIONAL,
      sourceUrl: 'https://example.gov.tw/demo',
      publishedAt: null,
      deadline: '2099-12-31',
      featured: true,
      contentMd: '示範內容，截止日期：2030年1月1日。'.repeat(10),
    }
    await syncCurated(t.db, t.queue, [item])
    const [row] = await t.db.select().from(welfarePrograms)
    expect(row).toMatchObject({ programKey: 'curated:demo', city: NATIONAL, sourceKind: 'curated', statusOverride: 'active' })
    expect(row!.pinnedAt).not.toBeNull()
    // 結構化不覆蓋人工寫的截止日，也不會把精選福利判成雜訊
    expect(await structureProgram(t.db, new RuleStructurer(), null, row!.id)).toBe('done')
    const [done] = await t.db.select().from(welfarePrograms)
    expect(done).toMatchObject({ deadline: '2099-12-31', status: 'active' })

    const jobs = t.queue.jobs.length
    await syncCurated(t.db, t.queue, [item])
    expect(t.queue.jobs.length).toBe(jobs)
    const [again] = await t.db.select().from(welfarePrograms)
    expect(again!.pinnedAt).toEqual(row!.pinnedAt)

    await syncCurated(t.db, t.queue, [{ ...item, featured: false }])
    expect((await t.db.select().from(welfarePrograms))[0]!.pinnedAt).toBeNull()
    await syncCurated(t.db, t.queue, [])
    expect((await t.db.select().from(welfarePrograms))[0]!.status).toBe('removed')
  })
})

describe('POST /v1/welfare/simulate', () => {
  const simulate = (body: object) =>
    t.app.request('/v1/welfare/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('以輸入的身分試算，不需登入', async () => {
    await createProgram(t.db, { name: '身障補助', identities: ['身心障礙者'] })
    const body = await json(await simulate({ profile: { identities: ['身心障礙者'] } }))
    expect(body.data[0].match.light).toBe('GREEN')
  })

  it('可以直接指定年齡組與性別（不必提供生日）', async () => {
    await createProgram(t.db, { name: '老人福利', identities: ['65歲以上'] })
    await createProgram(t.db, { name: '婦女福利', identities: ['女性'] })
    const body = await json(await simulate({ profile: { identities: ['65歲以上', '男性'] } }))
    const light = (n: string) => body.data.find((x: { name: string }) => x.name === n).match.light
    expect(light('老人福利')).toBe('GREEN')
    expect(light('婦女福利')).toBe('RED')
  })

  it('身分不在白名單時回傳 400', async () => {
    expect((await simulate({ profile: { identities: ['外星人'] } })).status).toBe(400)
  })
})

describe('收藏', () => {
  it('加入、重複加入、列出、取消', async () => {
    const p = await createProgram(t.db, { name: '收藏測試' })
    const { cookie } = await signUp(t)
    const put = () => t.app.request(`/v1/me/favorites/${p.id}`, { method: 'PUT', headers: { cookie } })
    expect((await put()).status).toBe(204)
    expect((await put()).status).toBe(204)
    expect(names(await json(await get('/v1/me/favorites', cookie)))).toEqual(['收藏測試'])
    expect((await json(await get(`/v1/welfare/${p.id}`, cookie))).data.isFavorite).toBe(true)
    expect((await t.app.request(`/v1/me/favorites/${p.id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(204)
    expect((await json(await get('/v1/me/favorites', cookie))).data).toEqual([])
  })

  it('收藏不存在或前台看不到的福利回傳 404', async () => {
    const removed = await createProgram(t.db, { status: 'removed' })
    const rejected = await createProgram(t.db, { status: 'rejected' })
    const { cookie } = await signUp(t)
    const put = (id: string) => t.app.request(`/v1/me/favorites/${id}`, { method: 'PUT', headers: { cookie } })
    expect((await put(removed.id)).status).toBe(404)
    expect((await put(rejected.id)).status).toBe(404)
    expect((await put('00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('收藏只屬於自己', async () => {
    const p = await createProgram(t.db)
    const a = await signUp(t, 'a@example.com')
    const b = await signUp(t, 'b@example.com')
    await t.app.request(`/v1/me/favorites/${p.id}`, { method: 'PUT', headers: { cookie: a.cookie } })
    expect((await json(await get('/v1/me/favorites', b.cookie))).data).toEqual([])
  })
})

describe('PATCH /v1/me', () => {
  it('更新後 GET /v1/me 反映新資料', async () => {
    const cookie = await signUpWithProfile({ birthday: '1950-05-01', gender: '女性', city: '金門縣', identities: ['原住民'] })
    expect((await json(await get('/v1/me', cookie))).data).toMatchObject({
      birthday: '1950-05-01',
      gender: '女性',
      city: '金門縣',
      identities: ['原住民'],
    })
  })

  it('空的更新不會出錯', async () => {
    const { cookie } = await signUp(t)
    const res = await t.app.request('/v1/me', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(200)
  })

  it.each([
    ['未來的生日', { birthday: '2999-01-01' }],
    ['不支援的縣市', { city: '火星' }],
    ['年齡組不能自填', { identities: ['65歲以上'] }],
    ['重複身分', { identities: ['原住民', '原住民'] }],
    ['R10 不能改 role', { role: 'admin' }],
    ['R10 不能改 email', { email: 'x@example.com' }],
  ])('拒絕：%s', async (_n, body) => {
    const { cookie } = await signUp(t)
    const res = await t.app.request('/v1/me', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(400)
  })
})
