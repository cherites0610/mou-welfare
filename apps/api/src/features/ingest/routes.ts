// 爬蟲專用端點（HMAC 簽章，見 access.ts）。內部介面，不列入公開的 openapi.json；格式由 packages/shared 的 Zod schema 定義。
import { IngestItem, IngestRemove } from '@mou-welfare/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../../app.ts'
import { apiError } from '../../lib/errors.ts'
import { ingest, remove } from './service.ts'

// 簽章驗證時已讀過 body；HonoRequest 會快取，這裡用 c.req.json() 而不是原始 Request
async function readJson(req: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

export const ingestRoutes = new Hono<AppEnv>()
  .post('/internal/ingest', async (c) => {
    const parsed = IngestItem.safeParse(await readJson(c.req))
    if (!parsed.success) return apiError(c, 400, 'invalid_request', '推送格式錯誤', { issues: parsed.error.issues })
    const { db, queue } = c.var.deps
    return c.json({ data: await ingest(db, queue, parsed.data) }, 200)
  })
  .post('/internal/remove', async (c) => {
    const parsed = IngestRemove.safeParse(await readJson(c.req))
    if (!parsed.success) return apiError(c, 400, 'invalid_request', '推送格式錯誤', { issues: parsed.error.issues })
    return c.json({ data: await remove(c.var.deps.db, parsed.data) }, 200)
  })
