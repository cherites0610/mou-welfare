// 聊天檢索評測（docs/backend.md §8.9）：eval/chat-cases.json 的真實問法，量前 6 筆有沒有找到該找的福利。
// 改規則解析、檢索的 SQL 或權重前後都要跑；低於門檻時以非 0 結束。只讀資料庫，問題的 embedding 呼叫 Gemini（費用可忽略）。
// 用法：tsx --env-file=<env> scripts/eval-chat.ts [--keyword-only] [--verbose]
import { readFileSync } from 'node:fs'
import { inArray } from 'drizzle-orm'
import { createDb } from '../src/db/client.ts'
import { welfarePrograms } from '../src/db/schema/index.ts'
import { type ChatFilters, mergeFilters, parseQuery } from '../src/features/chat/parse.ts'
import { retrieve } from '../src/features/chat/retrieve.ts'
import { GeminiLLM } from '../src/lib/llm/index.ts'

type Case = { id: string; q: string; history?: string[]; city?: string; profile?: { birthday?: string; identities?: string[] }; expect: string[]; note?: string }

/** 門檻：前 6 筆至少命中一筆的比例 */
const GATES = { hit: 0.9, keywordOnlyHit: 0.75 }

const args = process.argv.slice(2)
const keywordOnly = args.includes('--keyword-only')
const verbose = args.includes('--verbose')
const cases: Case[] = JSON.parse(readFileSync(new URL('../eval/chat-cases.json', import.meta.url), 'utf8'))
const { db, sql } = createDb(process.env.DATABASE_URL!)
const llm = keywordOnly ? null : new GeminiLLM(process.env.GEMINI_API_KEY!, 'unused', process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001')

const keys = [...new Set(cases.flatMap((c) => c.expect))]
const rows = await db.select({ id: welfarePrograms.id, key: welfarePrograms.programKey, status: welfarePrograms.status }).from(welfarePrograms).where(inArray(welfarePrograms.programKey, keys))
const idOf = new Map(rows.filter((r) => r.status === 'active').map((r) => [r.key, r.id]))
const missingKeys = keys.filter((k) => !idOf.has(k))

let hits = 0, recallSum = 0, scored = 0
const misses: string[] = []
for (const c of cases) {
  let filters: ChatFilters | null = null
  for (const text of [...(c.history ?? []), c.q]) filters = mergeFilters(parseQuery(text), text, filters, c.city ?? null)
  const f = filters!
  const embedding = llm ? ((await llm.embed([f.query], { purpose: 'eval' }, 'query'))[0] ?? null) : null
  const sources = await retrieve(db, { filters: f, embedding, profile: c.profile ?? null, family: null })
  const expected = c.expect.map((k) => idOf.get(k)).filter((x): x is string => !!x)
  if (!expected.length) continue
  scored++
  const found = expected.filter((id) => sources.some((s) => s.id === id))
  recallSum += found.length / Math.min(expected.length, sources.length || 1)
  if (found.length) hits++
  else misses.push(`${c.id} ${c.q}（${f.cities.join('、') || '不限縣市'}）→ ${sources.map((s) => `${s.city}${s.name}`).join('、') || '沒有結果'}`)
  if (verbose) console.log(`${found.length ? '✓' : '✗'} ${c.id} ${c.q} [${f.cities.join(',')}｜${f.query}]\n${sources.map((s) => `    ${s.score.toFixed(3)} ${s.city} ${s.name}`).join('\n')}`)
}
await sql.end()

const hitRate = hits / scored
const gate = keywordOnly ? GATES.keywordOnlyHit : GATES.hit
console.log(`\n模式：${keywordOnly ? '只用關鍵字（embedding 失敗時的備援）' : '語意＋關鍵字'}`)
console.log(`案例 ${scored} 個（${cases.length - scored} 個的正確答案已不在資料庫）`)
console.log(`前 6 筆命中率 ${(hitRate * 100).toFixed(1)}%（門檻 ${gate * 100}%）、平均召回率 ${((recallSum / scored) * 100).toFixed(1)}%`)
if (missingKeys.length) console.log(`\n已不在資料庫或不是 active 的正確答案（更新評測集）：\n  ${missingKeys.join('\n  ')}`)
if (misses.length) console.log(`\n沒有命中：\n  ${misses.join('\n  ')}`)
process.exit(hitRate >= gate ? 0 : 1)
