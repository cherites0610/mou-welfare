// R2Storage：用假的 fetch 驗證送出的請求（正式環境尚未設定 R2 金鑰）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorage, R2Storage } from '../src/lib/storage.ts'
import { testEnv } from './test-env.ts'

const cfg = {
  accountId: 'acc123',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
  bucket: 'mou-welfare-uploads',
  publicBaseUrl: 'https://files.mou-welfare.com/',
}

afterEach(() => vi.unstubAllGlobals())

describe('R2Storage', () => {
  it('以 SigV4 簽章 PUT 到 R2，並回傳公開網址', async () => {
    const calls: Request[] = []
    vi.stubGlobal('fetch', async (req: Request) => {
      calls.push(req)
      return new Response(null, { status: 200 })
    })
    const url = await new R2Storage(cfg).put('avatars/u1/a.webp', new Uint8Array([1, 2, 3]), 'image/webp')
    expect(url).toBe('https://files.mou-welfare.com/avatars/u1/a.webp')
    const req = calls[0]!
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://acc123.r2.cloudflarestorage.com/mou-welfare-uploads/avatars/u1/a.webp')
    expect(req.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request/)
    expect(req.headers.get('content-type')).toBe('image/webp')
  })

  it('R2 回應錯誤時丟出例外', async () => {
    vi.stubGlobal('fetch', async () => new Response('denied', { status: 403 }))
    await expect(new R2Storage(cfg).put('k', new Uint8Array(), 'image/webp')).rejects.toThrow('R2 put failed: 403')
  })
})

describe('createStorage', () => {
  it('STORAGE_DRIVER=none 時停用上傳', () => {
    expect(createStorage(testEnv({ STORAGE_DRIVER: 'none' }))).toBeNull()
  })
  it('STORAGE_DRIVER=r2 時建立 R2Storage', () => {
    const env = testEnv({
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'a',
      R2_ACCESS_KEY_ID: 'b',
      R2_SECRET_ACCESS_KEY: 'c',
      R2_BUCKET: 'd',
      R2_PUBLIC_BASE_URL: 'https://files.example.com',
    })
    expect(createStorage(env)).toBeInstanceOf(R2Storage)
  })
  it('STORAGE_DRIVER=r2 但缺少金鑰時拒絕啟動', () => {
    expect(() => testEnv({ STORAGE_DRIVER: 'r2' })).toThrow(/R2_ACCOUNT_ID/)
  })
})
