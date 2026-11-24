import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from '../../app.ts'
import { familyMode } from '../family/service.ts'
import { FamilyIdQuery, SearchQuery, SimulateBody, splitCsv, WelfareDetailSchema, WelfareListSchema } from './schema.ts'
import { getProgram, listSitemap, profileOf, searchPrograms } from './service.ts'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const list = createRoute({
  method: 'get',
  path: '/v1/welfare',
  tags: ['welfare'],
  summary: '搜尋福利（登入時附上資格比對）',
  request: { query: SearchQuery },
  responses: {
    200: json(WelfareListSchema, '福利列表'),
    401: json(ErrorSchema, '家庭模式未登入'),
    403: json(ErrorSchema, '不是該家庭成員'),
  },
})

const detail = createRoute({
  method: 'get',
  path: '/v1/welfare/{id}',
  tags: ['welfare'],
  summary: '福利詳情（登入時附上資格比對與收藏狀態）',
  request: { params: z.object({ id: z.uuid() }), query: z.object({ familyId: FamilyIdQuery }) },
  responses: {
    200: json(z.object({ data: WelfareDetailSchema }), '福利詳情'),
    401: json(ErrorSchema, '家庭模式未登入'),
    403: json(ErrorSchema, '不是該家庭成員'),
    404: json(ErrorSchema, '不存在或已下架'),
  },
})

const sitemap = createRoute({
  method: 'get',
  path: '/v1/sitemap',
  tags: ['welfare'],
  summary: '上架中福利的 id 與更新時間（前端產生 sitemap.xml 用）',
  responses: {
    200: json(z.object({ data: z.array(z.object({ id: z.uuid(), updatedAt: z.string() })) }), '福利清單'),
  },
})

const simulate = createRoute({
  method: 'post',
  path: '/v1/welfare/simulate',
  tags: ['welfare'],
  summary: '以手動輸入的身分試算（不需登入，不會儲存）',
  request: { body: { content: { 'application/json': { schema: SimulateBody } }, required: true } },
  responses: { 200: json(WelfareListSchema, '附上試算結果的福利列表') },
})

export const welfareRoutes = new OpenAPIHono<AppEnv>()
  .openapi(list, async (c) => {
    const q = c.req.valid('query')
    const params = { q: q.q, cities: splitCsv(q.city), categories: splitCsv(q.category), page: q.page, limit: q.limit }
    const family = await familyMode(c.var.deps.db, q.familyId, c.var.user?.id ?? null)
    const { data, total } = await searchPrograms(c.var.deps.db, params, profileOf(c.var.user), new Date(), family)
    return c.json({ data, meta: { page: q.page, limit: q.limit, total } }, 200)
  })
  .openapi(detail, async (c) => {
    const { id } = c.req.valid('param')
    const u = c.var.user
    const family = await familyMode(c.var.deps.db, c.req.valid('query').familyId, u?.id ?? null)
    const program = await getProgram(c.var.deps.db, id, profileOf(u), u?.id ?? null, family)
    if (!program) return c.json({ error: { code: 'not_found', message: '找不到這個福利' } }, 404)
    return c.json({ data: program }, 200)
  })
  .openapi(sitemap, async (c) => {
    const rows = await listSitemap(c.var.deps.db)
    c.header('Cache-Control', 'public, max-age=3600')
    return c.json({ data: rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })) }, 200)
  })
  .openapi(simulate, async (c) => {
    const b = c.req.valid('json')
    const params = { q: b.q, cities: splitCsv(b.city), categories: splitCsv(b.category), page: b.page, limit: b.limit }
    const profile = { birthday: b.profile.birthday ?? null, gender: b.profile.gender ?? null, identities: b.profile.identities ?? [] }
    const { data, total } = await searchPrograms(c.var.deps.db, params, profile)
    return c.json({ data, meta: { page: b.page, limit: b.limit, total } }, 200)
  })
