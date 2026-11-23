import type { z } from 'zod'

export type Message = { role: 'user' | 'assistant'; content: string }

export interface LLM {
  /** 結構化輸出：回傳值一定通過 schema 驗證，否則丟出 LLMError */
  generate<T>(opts: { system: string; input: string; schema: z.ZodType<T>; model?: string }): Promise<T>
  stream(opts: { system: string; messages: Message[] }): AsyncIterable<string>
  embed(texts: string[]): Promise<number[][]>
}

export class LLMError extends Error {
  constructor(
    message: string,
    /** quota：額度用完（402）或超過速率／花費限制（429），等一段時間或儲值後才會恢復 */
    public readonly kind: 'schema' | 'timeout' | 'provider' | 'quota',
  ) {
    super(message)
  }
}
