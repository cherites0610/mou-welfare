// Gemini 實作（docs/backend.md §8.3）。業務程式只依賴 LLM 介面，不直接使用這個檔案。
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { type LLM, LLMError, type Message } from './types.ts'

export const EMBEDDING_DIMS = 768

export class GeminiLLM implements LLM {
  private readonly ai: GoogleGenAI

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly embedModel: string,
    private readonly timeoutMs = 60_000,
  ) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } })
  }

  async generate<T>(opts: { system: string; input: string; schema: z.ZodType<T>; model?: string }): Promise<T> {
    const jsonSchema = z.toJSONSchema(opts.schema, { target: 'draft-2020-12' })
    let input = opts.input
    // 結構化輸出不合格時重試一次，並把驗證錯誤告訴模型
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.call(() =>
        this.ai.models.generateContent({
          model: opts.model ?? this.model,
          contents: input,
          config: {
            systemInstruction: opts.system,
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            temperature: 0,
          },
        }),
      ).then((r) => r.text ?? '')
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        raw = undefined
      }
      const parsed = opts.schema.safeParse(raw)
      if (parsed.success) return parsed.data
      input = `${opts.input}\n\n（上一次的輸出不符合格式：${parsed.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；') ?? '不是 JSON'}。請修正後重新輸出。）`
    }
    throw new LLMError('structured output does not match schema', 'schema')
  }

  async *stream(opts: { system: string; messages: Message[] }): AsyncIterable<string> {
    const res = await this.call(() =>
      this.ai.models.generateContentStream({
        model: this.model,
        contents: opts.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: { systemInstruction: opts.system },
      }),
    )
    for await (const chunk of res) {
      if (chunk.text) yield chunk.text
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return []
    const res = await this.call(() =>
      this.ai.models.embedContent({
        model: this.embedModel,
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIMS, taskType: 'RETRIEVAL_DOCUMENT' },
      }),
    )
    const vectors = (res.embeddings ?? []).map((e) => e.values ?? [])
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMS)) {
      throw new LLMError(`unexpected embedding shape (${vectors.length}×${vectors[0]?.length ?? 0})`, 'provider')
    }
    // 自訂維度的向量沒有正規化，cosine 距離不受影響，但先正規化讓分數可比較
    return vectors.map(normalize)
  }

  private async call<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (e) {
      throw toLLMError(e)
    }
  }
}

/** 把 SDK 的錯誤轉成 LLMError；額度不足（402，2026-11-22 實際遇過）和速率限制（429）歸為 quota */
export function toLLMError(e: unknown): LLMError {
  const msg = e instanceof Error ? e.message : String(e)
  const status = (e as { status?: unknown } | null)?.status
  if (status === 402 || status === 429 || /RESOURCE_EXHAUSTED|"code":\s*(?:402|429)\b/.test(msg)) return new LLMError(msg, 'quota')
  return new LLMError(msg, /timeout|aborted/i.test(msg) ? 'timeout' : 'provider')
}

export function normalize(v: number[]): number[] {
  const n = Math.hypot(...v)
  return n ? v.map((x) => x / n) : v
}
