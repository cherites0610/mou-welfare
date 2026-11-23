// Gemini 價格（每百萬 tokens 的美元；2026-11 官方價格頁 https://ai.google.dev/gemini-api/docs/pricing）。
// 用來在 llm_calls 記下「當時」的預估費用，以及 scripts/restructure.ts 的預估。價格調整時更新這裡。
export const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-embedding-001': { input: 0.15, output: 0 },
}

/** 思考 tokens 以輸出價計費；不在價格表中的模型回傳 null */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, thoughtsTokens = 0): number | null {
  const p = PRICES[model]
  return p ? (inputTokens * p.input + (outputTokens + thoughtsTokens) * p.output) / 1e6 : null
}
