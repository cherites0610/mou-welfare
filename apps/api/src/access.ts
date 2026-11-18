// 路由存取表：所有路由都必須在這裡登記（docs/testing.md §4.2 路由普查）。
// 預設拒絕：未登記或標為 'user' 的路由一律要求登入。
import type { MiddlewareHandler } from 'hono'
import type { Auth, SessionUser } from './lib/auth.ts'
import { apiError } from './lib/errors.ts'

export type Access =
  | 'public' // 不需登入
  | 'optional' // 不需登入；有登入時提供使用者（例如附上資格比對）
  | 'user' // 需登入
  | 'hmac' // 爬蟲：HMAC 簽章（P2 實作）
  | 'line' // LINE webhook：x-line-signature（P4 實作）

/** key 格式：`METHOD /path`，path 使用 Hono 路由語法；`*` 代表所有 method */
export const ROUTE_ACCESS = {
  'GET /health': 'public',
  'GET /openapi.json': 'public',
  '* /v1/auth/*': 'public', // Better Auth 自行處理
  'GET /v1/faq': 'public',
  'GET /v1/me': 'user',
  'PATCH /v1/me': 'user',
  'GET /v1/me/favorites': 'user',
  'PUT /v1/me/favorites/:programId': 'user',
  'DELETE /v1/me/favorites/:programId': 'user',
  'GET /v1/welfare': 'optional',
  'GET /v1/welfare/:id': 'optional',
  'POST /v1/welfare/simulate': 'public',
  'POST /v1/uploads/avatar': 'user',
} as const satisfies Record<string, Access>

type Compiled = { method: string; re: RegExp; access: Access; key: string }

function compile(): Compiled[] {
  return Object.entries(ROUTE_ACCESS).map(([key, access]) => {
    const [method, path] = key.split(' ') as [string, string]
    const pattern = path
      .split('/')
      .map((seg) => (seg === '*' ? '.*' : seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/')
    return { method, re: new RegExp(`^${pattern}/?$`), access, key }
  })
}

const compiled = compile()

export function accessFor(method: string, path: string): Access {
  const hit = compiled.find((r) => (r.method === '*' || r.method === method) && r.re.test(path))
  return hit?.access ?? 'user'
}

export type AppVariables = { user: SessionUser | null }

export function accessControl(
  auth: Auth,
  resolve: (method: string, path: string) => Access = accessFor,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const access = resolve(c.req.method, c.req.path)
    if (access === 'public') {
      c.set('user', null)
      return next()
    }
    if (access === 'optional') {
      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      c.set('user', session?.user ?? null)
      return next()
    }
    if (access === 'hmac' || access === 'line') {
      // 尚未實作簽章驗證前一律拒絕，避免重蹈 v1 的「未驗證就放行」
      return apiError(c, 401, 'unauthorized', '簽章驗證尚未啟用')
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return apiError(c, 401, 'unauthorized', '請先登入')
    c.set('user', session.user)
    return next()
  }
}
