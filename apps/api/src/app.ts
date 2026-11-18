import { OpenAPIHono } from '@hono/zod-openapi'
import { accessControl, type AppVariables } from './access.ts'
import type { Db } from './db/client.ts'
import type { Env } from './env.ts'
import { faqRoutes } from './features/faq/routes.ts'
import { healthRoutes } from './features/health/routes.ts'
import { meRoutes } from './features/me/routes.ts'
import { AUTH_BASE_PATH, type Auth } from './lib/auth.ts'
import { apiError } from './lib/errors.ts'

export type Deps = { db: Db; auth: Auth; env: Env }
export type AppEnv = { Variables: AppVariables & { deps: Deps } }

export function createApp(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return apiError(c, 400, 'invalid_request', '請求格式錯誤', { issues: result.error.issues })
      }
    },
  })

  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })
  app.use('*', accessControl(deps.auth))

  app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, (c) => deps.auth.handler(c.req.raw))

  app.route('/', healthRoutes)
  app.route('/', faqRoutes)
  app.route('/', meRoutes)

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
    console.error(err)
    return apiError(c, 500, 'internal', '伺服器錯誤')
  })

  return app
}

export type App = ReturnType<typeof createApp>
