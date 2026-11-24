// LINE webhook（docs/backend.md §8.7）。簽章在 access.ts 驗證；這裡只把事件排入佇列，立即回 200
// （LINE 要求盡快回應，回答由背景工作處理）。內部介面，不列入公開的 openapi.json。
import { Hono } from 'hono'
import type { AppEnv } from '../../app.ts'
import { apiError } from '../../lib/errors.ts'
import type { LineEvent } from './service.ts'

export const lineRoutes = new Hono<AppEnv>().post('/v1/line/webhook', async (c) => {
  let body: { events?: LineEvent[] }
  try {
    body = (await c.req.json()) as { events?: LineEvent[] }
  } catch {
    return apiError(c, 400, 'invalid_request', '格式錯誤')
  }
  // 設定 webhook 時 LINE 會送一個沒有事件的請求來驗證
  for (const event of Array.isArray(body.events) ? body.events : []) {
    await c.var.deps.queue.send('line-event', { webhookEventId: event.webhookEventId ?? null, event })
  }
  return c.json({}, 200)
})
