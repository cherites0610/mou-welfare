// 爬蟲推送的簽章（docs/scraper.md §7）。爬蟲端實作：services/scraper/src/scraper/push.py
//   X-Mou-Timestamp: unix 秒
//   X-Mou-Signature: sha256=<hex>，hex = HMAC-SHA256(INGEST_HMAC_KEY, "{timestamp}.{原始 body}")
// 時間戳與伺服器時間相差超過 5 分鐘就拒絕。重放同一個請求的效果和原本相同（ingest 是 upsert），不另外記錄 nonce。
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TIMESTAMP_HEADER = 'x-mou-timestamp'
export const SIGNATURE_HEADER = 'x-mou-signature'
export const MAX_SKEW_SECONDS = 300

export function sign(key: string, timestamp: number, body: Uint8Array | string): string {
  const mac = createHmac('sha256', key)
  mac.update(`${timestamp}.`)
  mac.update(body)
  return `sha256=${mac.digest('hex')}`
}

export type Verdict = 'ok' | 'missing' | 'expired' | 'bad_signature'

export function verify(
  key: string,
  headers: { timestamp: string | undefined; signature: string | undefined },
  body: Uint8Array,
  nowMs: number = Date.now(),
): Verdict {
  const { timestamp, signature } = headers
  if (!timestamp || !signature) return 'missing'
  if (!/^\d{1,12}$/.test(timestamp)) return 'bad_signature'
  const ts = Number(timestamp)
  if (Math.abs(nowMs / 1000 - ts) > MAX_SKEW_SECONDS) return 'expired'
  const expected = Buffer.from(sign(key, ts, body))
  const given = Buffer.from(signature)
  // 長度不同時 timingSafeEqual 會丟錯，先比長度（長度本身不是秘密）
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'bad_signature'
  return 'ok'
}
