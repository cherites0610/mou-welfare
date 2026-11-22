import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, desc, eq, ne } from 'drizzle-orm'
import type { AppEnv } from '../../app.ts'
import { favorites, welfarePrograms as w } from '../../db/schema/index.ts'
import { familyMode, matchFamily } from '../family/service.ts'
import { FamilyIdQuery, WelfareSummarySchema } from '../welfare/schema.ts'
import { profileOf } from '../welfare/service.ts'
import { match } from '@mou-welfare/shared'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const Params = z.object({ programId: z.uuid() })

const list = createRoute({
  method: 'get',
  path: '/v1/me/favorites',
  tags: ['favorite'],
  summary: '我的收藏（新到舊；帶 familyId 時附上家人的資格比對）',
  request: { query: z.object({ familyId: FamilyIdQuery }) },
  responses: {
    200: { description: '收藏列表', content: { 'application/json': { schema: z.object({ data: z.array(WelfareSummarySchema) }) } } },
    403: { description: '不是該家庭成員', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

const add = createRoute({
  method: 'put',
  path: '/v1/me/favorites/{programId}',
  tags: ['favorite'],
  summary: '加入收藏（重複加入不會出錯）',
  request: { params: Params },
  responses: {
    204: { description: '已收藏' },
    404: { description: '福利不存在或已下架', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/me/favorites/{programId}',
  tags: ['favorite'],
  summary: '取消收藏（未收藏也不會出錯）',
  request: { params: Params },
  responses: { 204: { description: '已取消' } },
})

export const favoriteRoutes = new OpenAPIHono<AppEnv>()
  .openapi(list, async (c) => {
    const u = c.var.user!
    const rows = await c.var.deps.db
      .select({
        id: w.id,
        name: w.name,
        city: w.city,
        categories: w.categories,
        identities: w.identities,
        summary: w.summary,
        publishedAt: w.publishedAt,
        deadline: w.deadline,
      })
      .from(favorites)
      .innerJoin(w, eq(w.id, favorites.programId))
      .where(and(eq(favorites.userId, u.id), ne(w.status, 'removed')))
      .orderBy(desc(favorites.createdAt))
    const profile = profileOf(u)!
    const family = await familyMode(c.var.deps.db, c.req.valid('query').familyId, u.id)
    const data = rows.map((r) => ({
      ...r,
      match: match(profile, r.identities),
      familyMatches: family ? matchFamily(family, r.identities) : null,
    }))
    return c.json({ data }, 200)
  })
  .openapi(add, async (c) => {
    const { programId } = c.req.valid('param')
    const db = c.var.deps.db
    const [p] = await db.select({ status: w.status }).from(w).where(eq(w.id, programId))
    if (!p || p.status === 'removed') return c.json({ error: { code: 'not_found', message: '找不到這個福利' } }, 404)
    await db.insert(favorites).values({ userId: c.var.user!.id, programId }).onConflictDoNothing()
    return c.body(null, 204)
  })
  .openapi(remove, async (c) => {
    const { programId } = c.req.valid('param')
    await c.var.deps.db
      .delete(favorites)
      .where(and(eq(favorites.userId, c.var.user!.id), eq(favorites.programId, programId)))
    return c.body(null, 204)
  })
