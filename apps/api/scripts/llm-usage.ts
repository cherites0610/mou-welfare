// LLM 用量報表（docs/backend.md §8.3.2）：從 llm_calls 彙總 token 與預估費用。只讀資料庫。
// 用法：tsx --env-file=<env> scripts/llm-usage.ts [--days 30] [--program <福利 id>]
import postgres from 'postgres'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const days = Number(opt('--days') ?? 30)
const program = opt('--program')
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
const usd = (v: unknown) => (v === null ? '—' : `$${Number(v).toFixed(4)}`)
const n = (v: unknown) => (v === null ? '—' : Number(v).toLocaleString('en-US'))

if (program) {
  const rows = await sql`
    select c.created_at, c.purpose, c.model, c.prompt_version, c.attempt, c.input_tokens, c.output_tokens, c.thoughts_tokens,
           c.latency_ms, c.ok, c.error_kind, c.cost_usd
    from llm_calls c where c.program_id = ${program} order by c.id`
  const [p] = await sql`select name, city, structured_by, structured_model, structured_prompt_version, structured_at from welfare_programs where id = ${program}`
  if (p) console.log(`${p.city}｜${p.name}\n目前結果：${p.structured_by ?? '—'}／${p.structured_model ?? '—'}／prompt ${p.structured_prompt_version ?? '—'}（${p.structured_at?.toISOString() ?? '—'}）\n`)
  console.table(rows.map((r) => ({
    時間: r.created_at.toISOString().slice(0, 19), 用途: r.purpose, 模型: r.model, prompt: r.prompt_version ?? '', 次: r.attempt,
    輸入: n(r.input_tokens), 輸出: n(r.output_tokens), 思考: n(r.thoughts_tokens), 毫秒: r.latency_ms, 結果: r.ok ? 'ok' : r.error_kind, 費用: usd(r.cost_usd),
  })))
  console.log(`合計 ${usd(rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0))}`)
} else {
  const since = sql`now() - make_interval(days => ${days})`
  const daily = await sql`
    select (created_at at time zone 'Asia/Taipei')::date::text as day, purpose, model,
      count(*) as calls, count(*) filter (where not ok) as errors,
      sum(input_tokens) as input, sum(output_tokens) as output, sum(thoughts_tokens) as thoughts, sum(cost_usd) as cost
    from llm_calls where created_at >= ${since} group by 1, 2, 3 order by 1, 2, 3`
  console.log(`最近 ${days} 天（台北時間，依日期／用途／模型）`)
  console.table(daily.map((r) => ({
    日期: r.day, 用途: r.purpose, 模型: r.model, 次數: n(r.calls), 失敗: n(r.errors),
    輸入: n(r.input), 輸出: n(r.output), 思考: n(r.thoughts), 費用: usd(r.cost),
  })))
  const [total] = await sql`
    select count(*) as calls, count(*) filter (where not ok) as errors, sum(input_tokens) as input, sum(output_tokens) as output,
      sum(cost_usd) as cost, count(distinct program_id) as programs
    from llm_calls where created_at >= ${since}`
  console.log(`合計：${n(total!.calls)} 次呼叫（失敗 ${n(total!.errors)}）、${n(total!.programs)} 筆福利、輸入 ${n(total!.input)}、輸出 ${n(total!.output)} tokens、約 ${usd(total!.cost)}`)
  const errors = await sql`
    select error_kind, count(*) as c, max(created_at) as last from llm_calls
    where created_at >= ${since} and not ok group by 1 order by 2 desc`
  if (errors.length) console.table(errors.map((r) => ({ 錯誤: r.error_kind, 次數: n(r.c), 最近: r.last.toISOString().slice(0, 19) })))
  const versions = await sql`
    select structured_model, structured_prompt_version, count(*) as c from welfare_programs
    where status <> 'removed' group by 1, 2 order by 3 desc`
  console.log('\n目前福利的結果由哪個模型與 prompt 版本產生（null＝規則）')
  console.table(versions.map((r) => ({ 模型: r.structured_model ?? 'null', prompt: r.structured_prompt_version ?? 'null', 筆數: n(r.c) })))
}
await sql.end()
