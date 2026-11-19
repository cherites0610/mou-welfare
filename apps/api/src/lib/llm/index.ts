// 專案唯一的 LLM 介面（docs/backend.md §8.3）。業務程式只依賴這個介面，不直接引用任何 SDK。
// 實作：fake.ts（測試 / staging）；gemini.ts（@google/genai）。
export { type LLM, LLMError, type Message } from './types.ts'
export { FakeLLM } from './fake.ts'
export { EMBEDDING_DIMS, GeminiLLM } from './gemini.ts'
