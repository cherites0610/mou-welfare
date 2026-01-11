export enum LlmProvider {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  QWEN = 'qwen',
}

export interface LlmConfig {
  apiKey: string
  baseURL?: string
  model: string
}

export interface ChatRequest {
  provider: LlmProvider
  systemPrompt: string
  userContent: string
}
