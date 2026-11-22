// 頭像上傳（R12）：需登入、只收圖片、大小上限；壓縮為 512×512 WebP 並移除 EXIF。
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { user } from '../src/db/schema/index.ts'
import { MAX_UPLOAD_BYTES } from '../src/lib/image.ts'
import type { MemoryStorage } from '../src/lib/storage.ts'
import { resetDb, setupApp, signUp } from './helpers.ts'

const t = setupApp()
const storage = t.storage as MemoryStorage
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.db)
  storage.objects.clear()
})

/** 2000×1000 的 JPEG，帶有含 GPS 資訊的 EXIF */
const photo = () =>
  sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#92c700' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'gps-secret' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 2/1 0/1' } })
    .toBuffer()

function upload(cookie: string | null, body: Blob, filename = 'photo.jpg', type?: string) {
  const form = new FormData()
  form.set('file', new File([body], filename, type ? { type } : {}))
  return t.app.request('/v1/uploads/avatar', { method: 'POST', body: form, headers: cookie ? { cookie } : {} })
}

describe('POST /v1/uploads/avatar', () => {
  it('R12 未登入回傳 401', async () => {
    expect((await upload(null, new Blob([await photo()]))).status).toBe(401)
  })

  it('壓縮為 512×512 WebP、移除 EXIF，並更新使用者頭像', async () => {
    const { cookie } = await signUp(t)
    const original = await photo()
    const res = await upload(cookie, new Blob([original]), 'photo.jpg', 'image/jpeg')
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { url: string } }

    const [key, obj] = [...storage.objects.entries()][0]!
    expect(key).toMatch(/^avatars\/[^/]+\/[0-9a-f-]{36}\.webp$/)
    expect(obj.contentType).toBe('image/webp')
    const meta = await sharp(obj.body).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 })
    expect(meta.exif).toBeUndefined()
    expect(obj.body.byteLength).toBeLessThan(original.byteLength)

    const [row] = await t.db.select().from(user).where(eq(user.email, 'user@example.com'))
    expect(row?.image).toBe(data.url)
  })

  it('重新上傳時刪除舊頭像，只保留新的', async () => {
    const { cookie } = await signUp(t)
    const first = await upload(cookie, new Blob([await photo()]), 'photo.jpg', 'image/jpeg')
    const second = await upload(cookie, new Blob([await photo()]), 'photo.jpg', 'image/jpeg')
    const [a, b] = [(await first.json()) as { data: { url: string } }, (await second.json()) as { data: { url: string } }]
    expect(a.data.url).not.toBe(b.data.url)
    expect([...storage.objects.keys()].map((k) => `https://files.test/${k}`)).toEqual([b.data.url])
  })

  it('以實際內容判斷格式：Content-Type 寫錯的 PNG 仍可上傳', async () => {
    const { cookie } = await signUp(t)
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#fff' } }).png().toBuffer()
    expect((await upload(cookie, new Blob([png]), 'a.gif', 'image/gif')).status).toBe(200)
  })

  it.each([
    ['文字檔偽裝成 JPG', new Blob(['not an image at all']), 'evil.jpg'],
    ['SVG（可能內含腳本）', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>']), 'a.svg'],
  ])('R12 拒絕：%s', async (_n, body, name) => {
    const { cookie } = await signUp(t)
    expect((await upload(cookie, body, name)).status).toBe(400)
  })

  it('R12 超過大小上限回傳 413', async () => {
    const { cookie } = await signUp(t)
    expect((await upload(cookie, new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 200 * 1024)]))).status).toBe(413)
  })

  it('缺少 file 欄位回傳 400', async () => {
    const { cookie } = await signUp(t)
    const form = new FormData()
    form.set('other', 'x')
    expect((await t.app.request('/v1/uploads/avatar', { method: 'POST', body: form, headers: { cookie } })).status).toBe(400)
  })

  it('尚未設定儲存時回傳 503', async () => {
    const none = setupApp({}, { storage: null })
    try {
      const { cookie } = await signUp(none, 'nostorage@example.com')
      const form = new FormData()
      form.set('file', new File([await photo()], 'p.jpg'))
      expect((await none.app.request('/v1/uploads/avatar', { method: 'POST', body: form, headers: { cookie } })).status).toBe(503)
    } finally {
      await none.close()
    }
  })
})
