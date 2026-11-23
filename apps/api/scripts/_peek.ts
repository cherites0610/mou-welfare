import { readFileSync } from 'node:fs'
import { buildInput, LLMStructuredWelfare, SYSTEM_PROMPT } from '../src/features/welfare/structure.ts'
import { GeminiLLM } from '../src/lib/llm/index.ts'
const cases = JSON.parse(readFileSync('eval/structure-cases.json', 'utf8'))
const llm = new GeminiLLM(process.env.GEMINI_API_KEY!, 'gemini-3.5-flash-lite', 'gemini-embedding-001')
for (const t of process.argv.slice(2)) {
  const c = cases.find((x: any) => x.title.includes(t))
  const o = await llm.generate({ system: SYSTEM_PROMPT, input: buildInput(c), schema: LLMStructuredWelfare })
  console.log(c.title, o.isIndividualWelfare, JSON.stringify(o.identityChecks, null, 0))
}
