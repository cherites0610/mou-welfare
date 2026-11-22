// POST /v1/uploads/avatar：上傳頭像（R12：需登入、只收圖片、大小上限）。
import { randomUUID } from 'node:crypto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from '../../app.ts'
import { user } from '../../db/schema/index.ts'
import { apiError } from '../../lib/errors.ts'
import { ImageError, MAX_UPLOAD_BYTES, processAvatar } from '../../lib/image.ts'

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const err = (description: string) => ({ description, content: { 'application/json': { schema: ErrorSchema } } })

const avatar = createRoute({
  method: 'post',
  path: '/v1/uploads/avatar',
  tags: ['upload'],
  summary: '上傳頭像（自動壓縮為 512×512 WebP 並移除 EXIF）',
  // 掛在路由上（而非 app.use），路由普查才不會把它當成額外的路由
  middleware: [
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024, // 多留一點給 multipart 邊界
      onError: (c) => apiError(c, 413, 'invalid_request', `檔案過大，上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`),
    }),
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.any().openapi({ type: 'string', format: 'binary', description: `JPEG / PNG / WebP / GIF，上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }) }),
        },
      },
    },
  },
  responses: {
    200: { description: '上傳完成，已更新頭像', content: { 'application/json': { schema: z.object({ data: z.object({ url: z.string() }) }) } } },
    400: err('不是可接受的圖片'),
    413: err('檔案過大'),
    503: err('尚未設定檔案儲存'),
  },
})

export const uploadRoutes = new OpenAPIHono<AppEnv>().openapi(
  avatar,
  async (c) => {
    const { storage, db } = c.var.deps
    if (!storage) return c.json({ error: { code: 'unavailable', message: '檔案上傳尚未啟用' } }, 503)

    const form = await c.req.parseBody()
    const file = form.file
    if (!(file instanceof File)) return c.json({ error: { code: 'invalid_request', message: '請以 file 欄位上傳圖片' } }, 400)
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: { code: 'invalid_request', message: '檔案過大' } }, 413)

    let image: Awaited<ReturnType<typeof processAvatar>>
    try {
      image = await processAvatar(new Uint8Array(await file.arrayBuffer()))
    } catch (e) {
      if (e instanceof ImageError) return c.json({ error: { code: 'invalid_request', message: e.message } }, 400)
      throw e
    }

    const u = c.var.user!
    const url = await storage.put(`avatars/${u.id}/${randomUUID()}.webp`, image.data, image.contentType)
    await db.update(user).set({ image: url }).where(eq(user.id, u.id))
    // 舊頭像不再使用：刪除失敗不影響這次上傳
    if (u.image && u.image !== url) await storage.remove(u.image).catch((e: unknown) => console.error('avatar cleanup', e))
    return c.json({ data: { url } }, 200)
  },
  // multipart 由 handler 自行解析與驗證，略過 zod 預設驗證錯誤格式
  (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'invalid_request', message: '請以 multipart/form-data 上傳 file 欄位' } }, 400)
    }
  },
)
