// LINE Messaging API（docs/backend.md §8.7）：webhook 簽章驗證與送出訊息。只用到幾個端點，直接呼叫 REST，不引入 SDK。
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Env } from '../env.ts'

export const LINE_SIGNATURE_HEADER = 'x-line-signature'
const API = 'https://api.line.me/v2/bot'

/** x-line-signature＝base64(HMAC-SHA256(channel secret, 原始 body)) */
export function verifyLineSignature(secret: string, body: Uint8Array, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(signature, 'base64')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** 送出的訊息（只列出用到的欄位；Flex 的內容直接照 LINE 的格式） */
export type LineMessage =
  | { type: 'text'; text: string; quickReply?: unknown }
  | { type: 'flex'; altText: string; contents: Record<string, unknown> }

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface LineBot {
  /** 用 reply token 回覆（免費、但有時效，且只能用一次） */
  reply(replyToken: string, messages: LineMessage[]): Promise<void>
  /** 主動推送（reply token 失效時的備案；計入每月的訊息額度） */
  push(to: string, messages: LineMessage[]): Promise<void>
  /** 「輸入中」的動畫，回覆送出後自動消失（只能用在一對一聊天） */
  loading(chatId: string, seconds?: number): Promise<void>
}

export class HttpLineBot implements LineBot {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown) {
    const res = await this.fetchImpl(`${API}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new LineApiError(res.status, `LINE ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  reply(replyToken: string, messages: LineMessage[]) {
    return this.post('/message/reply', { replyToken, messages })
  }

  push(to: string, messages: LineMessage[]) {
    return this.post('/message/push', { to, messages })
  }

  loading(chatId: string, seconds = 20) {
    return this.post('/chat/loading/start', { chatId, loadingSeconds: seconds })
  }
}

/** 有設定 LINE Bot 的金鑰時建立（背景工作用）；webhook 的簽章另外用 channel secret 驗證 */
export function lineBotOf(env: Env) {
  if (!env.LINE_BOT_ACCESS_TOKEN || !env.LINE_BOT_CHANNEL_SECRET) return null
  return { bot: new HttpLineBot(env.LINE_BOT_ACCESS_TOKEN), env }
}

/** 測試用：依序記下送出的訊息；可以讓 reply 失敗（模擬 reply token 過期） */
export class FakeLineBot implements LineBot {
  readonly sent: { via: 'reply' | 'push'; to: string; messages: LineMessage[] }[] = []
  readonly loadings: string[] = []
  replyFails = false

  async reply(replyToken: string, messages: LineMessage[]) {
    if (this.replyFails) throw new LineApiError(400, 'Invalid reply token')
    this.sent.push({ via: 'reply', to: replyToken, messages })
  }

  async push(to: string, messages: LineMessage[]) {
    this.sent.push({ via: 'push', to, messages })
  }

  async loading(chatId: string) {
    this.loadings.push(chatId)
  }
}
