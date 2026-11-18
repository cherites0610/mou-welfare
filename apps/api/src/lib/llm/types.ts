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
    public readonly kind: 'schema' | 'timeout' | 'provider',
  ) {
    super(message)
  }
}
