// 手動全量重做結構化（docs/backend.md §8.4.1）：改 prompt 或換模型後使用。
// 推送與重啟只會補做「內容變了或還沒用 LLM 做過」的福利，不會自動全量重做；要重做必須執行這支腳本。
// 先顯示筆數與預估費用，加上 --yes 才會排入佇列。
//
// 用法：tsx --env-file=<env> scripts/restructure.ts [--city 臺北市,基隆市] [--limit 100] [--yes]
import postgres from 'postgres'
import { loadEnv } from '../src/env.ts'
import { BossQueue, createBoss } from '../src/lib/queue.ts'

/** 每百萬 tokens 的美元價格（輸入、輸出；2026-11 官方價格頁）。不在表中的模型只顯示 token 數 */
const PRICES: Record<string, [number, number]> = {
  'gemini-3.5-flash-lite': [0.3, 2.5],
  'gemini-3.1-flash-lite': [0.25, 1.5],
  'gemini-3.8-flash': [0.75, 3.75],
}
const EMBED_PRICE = 0.15
// 2026-11-23 實測：中文約 0.84 token／字；system prompt 與 schema 約 1,500 tokens；輸出（含 identityChecks）約 400 tokens
const TOKENS_PER_CHAR = 0.84
const PROMPT_TOKENS = 1_500
const OUTPUT_TOKENS = 400
const EMBED_TOKENS = 250

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const cities = opt('--city')?.split(',').filter(Boolean) ?? []
const limit = Number(opt('--limit') ?? 100_000)
const yes = args.includes('--yes')

const env = loadEnv()
const driver = env.LLM_DRIVER ?? (env.GEMINI_API_KEY ? 'gemini' : 'rules')
const sql = postgres(env.DATABASE_URL, { max: 2 })
const rows = await sql<{ id: string; chars: number }[]>`
  select p.id,
    least(16000, length(p.content_md) + coalesce((select sum(length(coalesce(a.text, ''))) from welfare_attachments a where a.program_id = p.id), 0))::int + 200 as chars
  from welfare_programs p
  where p.status <> 'removed' and p.program_key not like 'mock:%'
    and (${cities.length === 0} or p.city = any(${cities}))
  order by p.updated_at
  limit ${limit}`

const input = rows.reduce((s, r) => s + Math.round(r.chars * TOKENS_PER_CHAR) + PROMPT_TOKENS, 0)
const output = rows.length * OUTPUT_TOKENS
const price = PRICES[env.GEMINI_MODEL]
const cost = price ? (input * price[0] + output * price[1] + rows.length * EMBED_TOKENS * EMBED_PRICE) / 1e6 : null
console.log(`結構化方式：${driver}${driver === 'gemini' ? `（${env.GEMINI_MODEL}）` : ''}`)
console.log(`範圍：${cities.length ? cities.join('、') : '全部縣市'}，${rows.length} 筆`)
console.log(`預估：輸入 ${(input / 1e6).toFixed(2)}M tokens、輸出 ${(output / 1e6).toFixed(2)}M tokens` + (cost === null ? '（此模型不在價格表中）' : `，約 US$${cost.toFixed(2)}`))
console.log(`預估時間：約 ${Math.ceil((rows.length * 1.8) / 60)} 分鐘（一次一筆）`)

if (driver !== 'gemini') {
  console.error('\n目前不是 Gemini 模式（LLM_DRIVER=rules 或沒有金鑰），重做沒有意義，不排入。')
  await sql.end()
  process.exit(1)
}
if (!yes) {
  console.log('\n確認後加上 --yes 執行。')
  await sql.end()
  process.exit(0)
}

const boss = await createBoss(env.DATABASE_URL)
const queued = new Set(
  (await sql<{ id: string }[]>`select distinct data->>'programId' as id from pgboss.job
    where name = 'welfare-structure' and state in ('created', 'retry', 'active')`).map((r) => r.id),
)
const queue = new BossQueue(boss)
let sent = 0
for (const r of rows) {
  if (queued.has(r.id)) continue
  await queue.send('welfare-structure', { programId: r.id, force: true })
  sent++
}
console.log(`\n已排入 ${sent} 筆（${rows.length - sent} 筆已在佇列中）。進度：/health 與 welfare_programs.structured_at`)
await boss.stop({ graceful: true, timeout: 5_000 })
await sql.end()
