// 專案唯一的 LLM 介面（docs/backend.md §8.3）。業務程式只依賴這個介面，不直接引用任何 SDK。
// 實作：fake.ts（測試 / staging）；gemini.ts（@google/genai）。
export { type LLM, type LLMCallMeta, LLMError, type LLMUsage, type Message, type UsageRecorder } from './types.ts'
export { FakeLLM } from './fake.ts'
export { EMBEDDING_DIMS, GeminiLLM, toLLMError } from './gemini.ts'
export { estimateCostUsd, PRICES } from './pricing.ts'
export { dbUsageRecorder } from './recorder.ts'
