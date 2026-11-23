import type { z } from 'zod'

export type Message = { role: 'user' | 'assistant'; content: string }

/** 呼叫的用途與對象，寫進 llm_calls 方便事後查帳（docs/backend.md §8.3.2） */
export type LLMCallMeta = {
  purpose: 'structure' | 'embed' | 'probe' | 'chat' | (string & {})
  programId?: string
  /** prompt 與 schema 的版本（structure.ts 的 PROMPT_VERSION） */
  promptVersion?: string
}

/** 每一次 API 呼叫的用量（含失敗與 schema 不合格後的重試） */
export type LLMUsage = LLMCallMeta & {
  model: string
  /** 同一次 generate 內第幾次呼叫（schema 不合格會重試一次） */
  attempt: number
  inputTokens: number | null
  outputTokens: number | null
  thoughtsTokens: number | null
  totalTokens: number | null
  inputChars: number
  latencyMs: number
  ok: boolean
  errorKind?: LLMError['kind']
  error?: string
}

export type UsageRecorder = (u: LLMUsage) => Promise<void>

export interface LLM {
  /** 預設模型（寫進結構化結果，事後才知道是哪個模型做的） */
  readonly model: string
  /** 結構化輸出：回傳值一定通過 schema 驗證，否則丟出 LLMError */
  generate<T>(opts: { system: string; input: string; schema: z.ZodType<T>; model?: string; meta?: LLMCallMeta }): Promise<T>
  /** 串流回答；用量在串流結束時記錄（最後一個 chunk 才有 usageMetadata） */
  stream(opts: { system: string; messages: Message[]; meta?: LLMCallMeta }): AsyncIterable<string>
  /** task：福利本身用 document（預設），使用者的問題用 query（Gemini 的 RETRIEVAL_QUERY） */
  embed(texts: string[], meta?: LLMCallMeta, task?: 'document' | 'query'): Promise<number[][]>
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
