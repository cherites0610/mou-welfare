// 測試與 staging 用的假 LLM：依輸入回傳預先錄好的結果，CI 永遠不呼叫真實模型（docs/testing.md §2）。
import type { z } from 'zod'
import { type LLM, type LLMCallMeta, LLMError, type Message, type UsageRecorder } from './types.ts'

export class FakeLLM implements LLM {
  readonly model = 'fake'

  constructor(
    private readonly responses: {
      generate?: (input: string) => unknown
      stream?: string[]
      /** 串流在吐出這麼多段後丟出錯誤（測試退回固定格式） */
      streamFailAfter?: number
      streamError?: LLMError
      dims?: number
      /** 測試用量紀錄：每次呼叫以字數當作 token 數回報 */
      recorder?: UsageRecorder
    } = {},
  ) {}

  private async record(meta: LLMCallMeta, chars: number) {
    await this.responses.recorder?.({
      ...meta,
      model: this.model,
      attempt: 1,
      inputTokens: chars,
      outputTokens: 10,
      thoughtsTokens: 0,
      totalTokens: chars + 10,
      inputChars: chars,
      latencyMs: 1,
      ok: true,
    })
  }

  async generate<T>(opts: { system: string; input: string; schema: z.ZodType<T>; model?: string; meta?: LLMCallMeta }): Promise<T> {
    await this.record(opts.meta ?? { purpose: 'generate' }, opts.input.length)
    const raw = this.responses.generate?.(opts.input)
    const parsed = opts.schema.safeParse(raw)
    if (!parsed.success) throw new LLMError('fake response does not match schema', 'schema')
    return parsed.data
  }

  /** 最後一次 stream 收到的內容（測試檢查 prompt） */
  lastStream: { system: string; messages: Message[] } | null = null

  async *stream(opts: { system: string; messages: Message[]; meta?: LLMCallMeta }): AsyncIterable<string> {
    this.lastStream = { system: opts.system, messages: opts.messages }
    const chunks = this.responses.stream ?? ['哞～', '這是測試回覆。']
    const failAt = this.responses.streamFailAfter
    for (const [i, chunk] of chunks.entries()) {
      if (failAt !== undefined && i >= failAt) break
      yield chunk
    }
    if (failAt !== undefined) throw this.responses.streamError ?? new LLMError('fake stream failed', 'provider')
    await this.record(opts.meta ?? { purpose: 'chat' }, opts.system.length)
  }

  async embed(texts: string[], meta?: LLMCallMeta, _task?: 'document' | 'query'): Promise<number[][]> {
    await this.record(meta ?? { purpose: 'embed' }, texts.join('').length)
    const dims = this.responses.dims ?? 768
    return texts.map((t) => Array.from({ length: dims }, (_, i) => ((t.charCodeAt(i % t.length) || 0) % 100) / 100))
  }
}
