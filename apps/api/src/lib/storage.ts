// 檔案儲存：Cloudflare R2（S3 相容 API，用 aws4fetch 簽章）。測試用 MemoryStorage。
import { AwsClient } from 'aws4fetch'
import type { Env } from '../env.ts'

export interface Storage {
  /** 上傳並回傳對外網址 */
  put(key: string, body: Uint8Array, contentType: string): Promise<string>
  /** 刪除 put 回傳的網址；不是自己存的網址（例如 Google 頭像）就略過 */
  remove(url: string): Promise<void>
}

export class R2Storage implements Storage {
  private readonly client: AwsClient
  constructor(
    private readonly cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBaseUrl: string },
  ) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: 'auto' })
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<string> {
    const url = `https://${this.cfg.accountId}.r2.cloudflarestorage.com/${this.cfg.bucket}/${key}`
    const res = await this.client.fetch(url, {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
    })
    if (!res.ok) throw new Error(`R2 put failed: ${res.status}`)
    return `${this.base}/${key}`
  }

  async remove(publicUrl: string): Promise<void> {
    if (!publicUrl.startsWith(`${this.base}/`)) return
    const key = publicUrl.slice(this.base.length + 1)
    const url = `https://${this.cfg.accountId}.r2.cloudflarestorage.com/${this.cfg.bucket}/${key}`
    const res = await this.client.fetch(url, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`)
  }

  private get base() {
    return this.cfg.publicBaseUrl.replace(/\/$/, '')
  }
}

export class MemoryStorage implements Storage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>()
  async put(key: string, body: Uint8Array, contentType: string): Promise<string> {
    this.objects.set(key, { body, contentType })
    return `https://files.test/${key}`
  }
  async remove(url: string): Promise<void> {
    if (url.startsWith('https://files.test/')) this.objects.delete(url.slice('https://files.test/'.length))
  }
}

export function createStorage(env: Env): Storage | null {
  if (env.STORAGE_DRIVER !== 'r2') return null
  return new R2Storage({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET!,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL!,
  })
}
