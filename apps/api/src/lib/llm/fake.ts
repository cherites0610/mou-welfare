// 測試與 staging 用的假 LLM：依輸入回傳預先錄好的結果，CI 永遠不呼叫真實模型（docs/testing.md §2）。
import type { z } from 'zod'
import { type LLM, LLMError, type Message } from './types.ts'

export class FakeLLM implements LLM {
  constructor(
    private readonly responses: {
      generate?: (input: string) => unknown
      stream?: string[]
      dims?: number
    } = {},
  ) {}

  async generate<T>(opts: { system: string; input: string; schema: z.ZodType<T>; model?: string }): Promise<T> {
    const raw = this.responses.generate?.(opts.input)
    const parsed = opts.schema.safeParse(raw)
    if (!parsed.success) throw new LLMError('fake response does not match schema', 'schema')
    return parsed.data
  }

  async *stream(_opts: { system: string; messages: Message[] }): AsyncIterable<string> {
    for (const chunk of this.responses.stream ?? ['哞～', '這是測試回覆。']) yield chunk
  }

  async embed(texts: string[]): Promise<number[][]> {
    const dims = this.responses.dims ?? 768
    return texts.map((t) => Array.from({ length: dims }, (_, i) => ((t.charCodeAt(i % t.length) || 0) % 100) / 100))
  }
}
