import { OpenAPIHono } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { accessControl, type AppVariables } from './access.ts'
import type { Db } from './db/client.ts'
import type { Env } from './env.ts'
import { chatRoutes } from './features/chat/routes.ts'
import { faqRoutes } from './features/faq/routes.ts'
import { adminRoutes } from './features/admin/routes.ts'
import { familyRoutes } from './features/family/routes.ts'
import { favoriteRoutes } from './features/favorite/routes.ts'
import { healthRoutes } from './features/health/routes.ts'
import { ingestRoutes } from './features/ingest/routes.ts'
import { scraperAdminRoutes, scraperInternalRoutes } from './features/scraper/routes.ts'
import { meRoutes } from './features/me/routes.ts'
import { uploadRoutes } from './features/upload/routes.ts'
import { welfareRoutes } from './features/welfare/routes.ts'
import { AUTH_BASE_PATH, type Auth } from './lib/auth.ts'
import type { Mailer } from './lib/mail/index.ts'
import type { LLM } from './lib/llm/index.ts'
import type { Queue } from './lib/queue.ts'
import type { Storage } from './lib/storage.ts'
import { ApiError, apiError } from './lib/errors.ts'

export type Deps = {
  db: Db
  auth: Auth
  env: Env
  mailer: Mailer
  storage: Storage | null
  queue: Queue
  /** 聊天用的 LLM（docs/backend.md §8.9）；null 或未提供＝規則模式，聊天退回固定格式 */
  llm?: LLM | null
}
export type AppEnv = { Variables: AppVariables & { deps: Deps } }

export function createApp(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return apiError(c, 400, 'invalid_request', '請求格式錯誤', { issues: result.error.issues })
      }
    },
  })

  // 前端在不同網域（mou-welfare.com ↔ api-v2.mou-welfare.com），只允許 TRUSTED_ORIGINS 帶 cookie 呼叫
  app.use(
    '*',
    cors({
      origin: (origin) => (deps.env.TRUSTED_ORIGINS.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  )
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })
  // 爬蟲推送含正文與附件文字（各約 30k 字），簽章驗證前先限制大小
  // （掛在 '*' 再判斷路徑：掛在 '/internal/*' 會被路由普查當成一條未登記的路由）
  const internalLimit = bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => apiError(c, 413, 'invalid_request', '推送內容太大'),
  })
  app.use('*', (c, next) => (c.req.path.startsWith('/internal/') ? internalLimit(c, next) : next()))
  app.use('*', accessControl(deps.auth, { hmacKey: deps.env.INGEST_HMAC_KEY }))

  app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, (c) => deps.auth.handler(c.req.raw))

  app.route('/', healthRoutes)
  app.route('/', faqRoutes)
  app.route('/', meRoutes)
  app.route('/', favoriteRoutes)
  app.route('/', familyRoutes)
  app.route('/', adminRoutes)
  app.route('/', scraperAdminRoutes)
  app.route('/', welfareRoutes)
  app.route('/', uploadRoutes)
  app.route('/', chatRoutes)
  app.route('/', ingestRoutes)
  app.route('/', scraperInternalRoutes)

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: '哞福利 API', version: '2.0.0' },
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
  })

  app.notFound((c) => apiError(c, 404, 'not_found', '找不到資源'))
  app.onError((err, c) => {
    if (err instanceof ApiError) return apiError(c, err.status, err.code, err.message)
    console.error(err)
    return apiError(c, 500, 'internal', '伺服器錯誤')
  })

  return app
}

export type App = ReturnType<typeof createApp>
