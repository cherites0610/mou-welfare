// 結構化回測（docs/backend.md §8.3.1）：用 eval/ 的固定快照跑一次正式的結構化流程，和人工標記的正確答案比對。
// 改 prompt、換模型、改 schema 或 buildInput 前後都要跑；低於門檻時以非 0 結束。
// 用法：tsx --env-file=<env> scripts/eval-structure.ts [模型=GEMINI_MODEL] [--out 結果.json]
import { readFileSync, writeFileSync } from 'node:fs'
import type { Identity } from '@mou-welfare/shared'
import { LLMStructurer, type StructureInput, type StructureResult } from '../src/features/welfare/structure.ts'
import { GeminiLLM } from '../src/lib/llm/index.ts'

type Case = StructureInput & { id: string; sourceUrl: string }
type Label = { title: string; isIndividualWelfare: boolean; identities: Identity[]; deadline: string | null; note?: string }

/** 門檻（docs/backend.md §8.3.1） */
const GATES = {
  individualRecall: 0.95, // 真福利被判為否會從列表消失
  individualPrecision: 0.9,
  identityOverRate: 0.03, // 多標身分會讓符合的人看到紅燈，最嚴重
  identityUnderRate: 0.15,
  deadlineAccuracy: 0.95,
}

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : undefined
const model = args[0] ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'
const dir = new URL('../eval/', import.meta.url)
const cases: Case[] = JSON.parse(readFileSync(new URL('structure-cases.json', dir), 'utf8'))
const labels: Record<string, Label> = JSON.parse(readFileSync(new URL('structure-labels.json', dir), 'utf8'))

const structurer = new LLMStructurer(new GeminiLLM(process.env.GEMINI_API_KEY!, model, 'gemini-embedding-001', 120_000))
const results: Record<string, StructureResult | { error: string }> = {}
const queue = [...cases]
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        results[c.id] = await structurer.structure(c)
      } catch (e) {
        results[c.id] = { error: String(e instanceof Error ? e.message : e) }
      }
      process.stderr.write('.')
    }
  }),
)
process.stderr.write('\n')
if (out) writeFileSync(out, JSON.stringify(results, null, 1))

let tp = 0, fp = 0, fn = 0, errors = 0, unlabeled = 0, positives = 0, over = 0, under = 0, deadlineOk = 0
const problems: string[] = []
for (const c of cases) {
  const exp = labels[c.id]
  const got = results[c.id]!
  if (!exp) { unlabeled++; continue }
  if ('error' in got) { errors++; problems.push(`錯誤 ${c.title}：${got.error}`); continue }
  if (got.isIndividualWelfare && exp.isIndividualWelfare) tp++
  else if (got.isIndividualWelfare) { fp++; problems.push(`誤判為福利　${c.city}｜${c.title}`) }
  else if (exp.isIndividualWelfare) { fn++; problems.push(`漏掉福利　　${c.city}｜${c.title}`) }
  if (!exp.isIndividualWelfare || !got.isIndividualWelfare) continue
  positives++
  const extra = got.identities.filter((i) => !exp.identities.includes(i))
  const missing = exp.identities.filter((i) => !got.identities.includes(i))
  if (extra.length) { over++; problems.push(`多標身分　　${c.city}｜${c.title}：${extra.join('、')}`) }
  if (missing.length) { under++; problems.push(`少標身分　　${c.city}｜${c.title}：${missing.join('、')}`) }
  if (got.deadline === exp.deadline) deadlineOk++
  else problems.push(`截止日　　　${c.city}｜${c.title}：${got.deadline ?? '無'}（應為 ${exp.deadline ?? '無'}）`)
}

const ratio = (a: number, b: number) => (b ? a / b : 1)
const metrics = {
  individualRecall: ratio(tp, tp + fn),
  individualPrecision: ratio(tp, tp + fp),
  identityOverRate: ratio(over, positives),
  identityUnderRate: ratio(under, positives),
  deadlineAccuracy: ratio(deadlineOk, positives),
}
const pass = (k: keyof typeof GATES) => (k.endsWith('Rate') ? metrics[k] <= GATES[k] : metrics[k] >= GATES[k])
console.log(`模型 ${model}｜${cases.length} 筆（未標記 ${unlabeled}、錯誤 ${errors}）`)
for (const k of Object.keys(GATES) as (keyof typeof GATES)[]) {
  console.log(`${pass(k) ? '✅' : '❌'} ${k.padEnd(20)} ${(metrics[k] * 100).toFixed(1)}%（門檻 ${k.endsWith('Rate') ? '≤' : '≥'} ${GATES[k] * 100}%）`)
}
if (problems.length) console.log(`\n${problems.join('\n')}`)
const ok = !errors && !unlabeled && (Object.keys(GATES) as (keyof typeof GATES)[]).every(pass)
process.exit(ok ? 0 : 1)
