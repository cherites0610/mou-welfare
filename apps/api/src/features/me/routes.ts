import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CITIES, GENDERS, SPECIAL_IDENTITIES } from '@mou-welfare/shared'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../../app.ts'
import { user } from '../../db/schema/index.ts'

const Me = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
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

type Row = { id: string; name: string; email: string; birthday?: string | null; gender?: string | null; city?: string | null; identities?: string[] | null }
const toMe = (u: Row) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  birthday: u.birthday ?? null,
  gender: u.gender ?? null,
  city: u.city ?? null,
  identities: u.identities ?? [],
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
