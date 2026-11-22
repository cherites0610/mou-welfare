import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CITIES, GENDERS, SPECIAL_IDENTITIES } from '@mou-welfare/shared'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../../app.ts'
import { user } from '../../db/schema/index.ts'
import { handOverFamilies } from '../family/service.ts'

const Me = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.string().nullable(),
    birthday: z.string().nullable(),
    gender: z.string().nullable(),
    city: z.string().nullable(),
    identities: z.array(z.string()),
  })
  .openapi('Me')

const today = () => new Date().toISOString().slice(0, 10)

// .strict()：多餘欄位（例如 role、email、lineId）直接回 400，不會被默默寫入（R10）
const UpdateMe = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    birthday: z.iso
      .date()
      .refine((d) => d >= '1900-01-01' && d <= today(), { message: '生日不合理' })
      .nullable()
      .optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    city: z.enum(CITIES).nullable().optional(),
    identities: z
      .array(z.enum(SPECIAL_IDENTITIES))
      .max(SPECIAL_IDENTITIES.length)
      .refine((xs) => new Set(xs).size === xs.length, { message: '身分不可重複' })
      .optional()
      .openapi({ description: '只接受特殊身分；年齡與性別由生日、性別欄位推得' }),
  })
  .strict()
  .openapi('UpdateMe')

// 要求明確的確認字串：避免前端誤觸或被其他程式誤呼叫就刪掉整個帳號
const DeleteMe = z.object({ confirm: z.literal('DELETE') }).strict().openapi('DeleteMe')

const ok = { description: '目前登入的使用者', content: { 'application/json': { schema: z.object({ data: Me }) } } }

const get = createRoute({ method: 'get', path: '/v1/me', tags: ['me'], security: [{ cookieAuth: [] }], responses: { 200: ok } })

const patch = createRoute({
  method: 'patch',
  path: '/v1/me',
  tags: ['me'],
  summary: '更新個人資料（用於資格比對）',
  security: [{ cookieAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateMe } }, required: true } },
  responses: { 200: ok },
})

type Row = { id: string; name: string; email: string; image?: string | null; birthday?: string | null; gender?: string | null; city?: string | null; identities?: string[] | null }
const toMe = (u: Row) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image ?? null,
  birthday: u.birthday ?? null,
  gender: u.gender ?? null,
  city: u.city ?? null,
  identities: u.identities ?? [],
})

const remove = createRoute({
  method: 'delete',
  path: '/v1/me',
  tags: ['me'],
  summary: '刪除帳號（含登入方式、收藏、家庭成員身分與頭像；無法復原）',
  security: [{ cookieAuth: [] }],
  request: { body: { content: { 'application/json': { schema: DeleteMe } }, required: true } },
  responses: { 204: { description: '已刪除' } },
})

export const meRoutes = new OpenAPIHono<AppEnv>()
  // accessControl 已保證 user 存在（ROUTE_ACCESS 標為 'user'）
  .openapi(get, (c) => c.json({ data: toMe(c.var.user!) }, 200))
  .openapi(patch, async (c) => {
    const body = c.req.valid('json')
    if (Object.keys(body).length === 0) return c.json({ data: toMe(c.var.user!) }, 200)
    const [row] = await c.var.deps.db.update(user).set(body).where(eq(user.id, c.var.user!.id)).returning()
    return c.json({ data: toMe(row!) }, 200)
  })
  .openapi(remove, async (c) => {
    const { db, storage } = c.var.deps
    const u = c.var.user!
    await db.transaction(async (tx) => {
      // 自己是唯一管理者的家庭交給其他成員；只剩自己的家庭直接刪除。其餘資料由外鍵 cascade 刪除
      await handOverFamilies(tx, u.id)
      await tx.delete(user).where(eq(user.id, u.id))
    })
    if (u.image && storage) await storage.remove(u.image).catch((e: unknown) => console.error('avatar cleanup', e))
    return c.body(null, 204)
  })
