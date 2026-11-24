// 路由存取表：所有路由都必須在這裡登記（docs/testing.md §4.2 路由普查）。
// 預設拒絕：未登記或標為 'user' 的路由一律要求登入；'admin' 另外要求管理者角色。
import type { MiddlewareHandler } from 'hono'
import type { Auth, SessionUser } from './lib/auth.ts'
import { apiError } from './lib/errors.ts'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from './lib/hmac.ts'
import { LINE_SIGNATURE_HEADER, verifyLineSignature } from './lib/line.ts'

export type Access =
  | 'public' // 不需登入
  | 'optional' // 不需登入；有登入時提供使用者（例如附上資格比對）
  | 'user' // 需登入
  | 'admin' // 管理端：需登入、Email 已驗證且 role = 'admin'（docs/admin.md）
  | 'hmac' // 爬蟲：HMAC 簽章（lib/hmac.ts）
  | 'line' // LINE webhook：x-line-signature（lib/line.ts）

/** key 格式：`METHOD /path`，path 使用 Hono 路由語法；`*` 代表所有 method */
export const ROUTE_ACCESS = {
  'GET /health': 'public',
  'GET /openapi.json': 'public',
  '* /v1/auth/*': 'public', // Better Auth 自行處理
  'GET /v1/faq': 'public',
  'GET /v1/me': 'user',
  'PATCH /v1/me': 'user',
  'DELETE /v1/me': 'user',
  'GET /v1/me/favorites': 'user',
  'PUT /v1/me/favorites/:programId': 'user',
  'DELETE /v1/me/favorites/:programId': 'user',
  'GET /v1/families': 'user',
  'POST /v1/families': 'user',
  'GET /v1/families/:id': 'user',
  'PATCH /v1/families/:id': 'user',
  'DELETE /v1/families/:id': 'user',
  'GET /v1/families/:id/members': 'user',
  'PATCH /v1/families/:id/members/:userId': 'user',
  'DELETE /v1/families/:id/members/:userId': 'user',
  'POST /v1/families/:id/invites': 'user',
  'GET /v1/invites/:code': 'user',
  'POST /v1/invites/:code/accept': 'user',
  'GET /v1/welfare': 'optional', // 帶 familyId 時必須登入且為成員（R6）
  'GET /v1/welfare/:id': 'optional',
  'POST /v1/welfare/simulate': 'public',
  'GET /v1/sitemap': 'public',
  'POST /v1/uploads/avatar': 'user',
  'GET /v1/chat/sessions': 'user',
  'POST /v1/chat/sessions': 'user',
  'GET /v1/chat/sessions/:id': 'user',
  'DELETE /v1/chat/sessions/:id': 'user',
  'POST /v1/chat/sessions/:id/messages': 'user',
  'GET /v1/admin/overview': 'admin',
  'GET /v1/admin/welfare': 'admin',
  'GET /v1/admin/welfare/:id': 'admin',
  'PATCH /v1/admin/welfare/:id': 'admin',
  'POST /v1/admin/welfare/:id/restructure': 'admin',
  'GET /v1/admin/llm-usage': 'admin',
  'GET /v1/admin/users': 'admin',
  'GET /v1/admin/users/:id': 'admin',
  'GET /v1/admin/audit': 'admin',
  'GET /v1/admin/scraper': 'admin',
  'GET /v1/admin/scraper/runs/:id': 'admin',
  'POST /internal/ingest': 'hmac',
  'POST /internal/remove': 'hmac',
  'POST /v1/line/webhook': 'line',
  'POST /internal/scrape-runs': 'hmac',
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

export type AccessOptions = {
  resolve?: (method: string, path: string) => Access
  /** 爬蟲推送的 HMAC 金鑰；沒有就拒絕所有 hmac 路由 */
  hmacKey?: string | undefined
  /** LINE Bot 的 channel secret；沒有就拒絕 webhook */
  lineSecret?: string | undefined
  now?: () => number
}

export function accessControl(auth: Auth, opts: AccessOptions = {}): MiddlewareHandler<{ Variables: AppVariables }> {
  const resolve = opts.resolve ?? accessFor
  const now = opts.now ?? Date.now
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
    if (access === 'hmac') {
      if (!opts.hmacKey) return apiError(c, 401, 'unauthorized', '簽章驗證未設定')
      // 用原始 body 驗證；Hono 會快取 body，之後的 c.req.json() 仍可讀取
      const body = new Uint8Array(await c.req.arrayBuffer())
      const verdict = verify(
        opts.hmacKey,
        { timestamp: c.req.header(TIMESTAMP_HEADER), signature: c.req.header(SIGNATURE_HEADER) },
        body,
        now(),
      )
      if (verdict !== 'ok') return apiError(c, 401, 'unauthorized', `簽章驗證失敗（${verdict}）`)
      c.set('user', null)
      return next()
    }
    if (access === 'line') {
      // 沒有設定 channel secret 就一律拒絕，避免重蹈 v1 的「未驗證就放行」
      if (!opts.lineSecret) return apiError(c, 401, 'unauthorized', '簽章驗證未設定')
      const body = new Uint8Array(await c.req.arrayBuffer())
      if (!verifyLineSignature(opts.lineSecret, body, c.req.header(LINE_SIGNATURE_HEADER))) {
        return apiError(c, 401, 'unauthorized', '簽章驗證失敗')
      }
      c.set('user', null)
      return next()
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return apiError(c, 401, 'unauthorized', '請先登入')
    if (access === 'admin' && !(session.user.role === 'admin' && session.user.emailVerified)) {
      return apiError(c, 403, 'forbidden', '需要管理者權限')
    }
    c.set('user', session.user)
    return next()
  }
}
