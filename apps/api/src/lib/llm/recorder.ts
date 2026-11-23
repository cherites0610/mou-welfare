// 把 LLM 用量寫進 llm_calls（docs/backend.md §8.3.2）。
import type { Db } from '../../db/client.ts'
import { llmCalls } from '../../db/schema/index.ts'
import { estimateCostUsd } from './pricing.ts'
import type { UsageRecorder } from './types.ts'

export function dbUsageRecorder(db: Db): UsageRecorder {
  return async (u) => {
    await db.insert(llmCalls).values({
      purpose: u.purpose,
      programId: u.programId ?? null,
      model: u.model,
      promptVersion: u.promptVersion ?? null,
      attempt: u.attempt,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      thoughtsTokens: u.thoughtsTokens,
      totalTokens: u.totalTokens,
      inputChars: u.inputChars,
      latencyMs: u.latencyMs,
      ok: u.ok,
      errorKind: u.errorKind ?? null,
      error: u.error ?? null,
      costUsd: u.inputTokens === null ? null : estimateCostUsd(u.model, u.inputTokens, u.outputTokens ?? 0, u.thoughtsTokens ?? 0),
    })
  }
}
