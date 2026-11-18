import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { AppEnv } from '../../app.ts'

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

const get = createRoute({
  method: 'get',
  path: '/v1/me',
  tags: ['me'],
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: '目前登入的使用者', content: { 'application/json': { schema: z.object({ data: Me }) } } },
  },
})

export const meRoutes = new OpenAPIHono<AppEnv>().openapi(get, (c) => {
  // accessControl 已保證 user 存在（ROUTE_ACCESS 標為 'user'）
  const u = c.var.user!
  return c.json(
    {
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        birthday: u.birthday ?? null,
        gender: u.gender ?? null,
        city: u.city ?? null,
        identities: u.identities ?? [],
      },
    },
    200,
  )
})
