// 結構化模型比較（docs/backend.md §8.3）：從資料庫抽樣，對每個模型跑一次，記錄 token、延遲與結果。只讀資料庫，不寫回。
// 用法：tsx --env-file=<env> scripts/compare-llm.ts [筆數=30] [模型,模型…] > /tmp/llm-compare.json
//   SEED=<字串>：換一組抽樣；EXCLUDE=<id,id…>：排除；INCLUDE=<id,id…>：一定包含（算在筆數內）
import { GoogleGenAI } from '@google/genai'
import postgres from 'postgres'
import { z } from 'zod'
import { buildInput, StructuredWelfare, SYSTEM_PROMPT } from '../src/features/welfare/structure.ts'

const n = Number(process.argv[2] ?? 30)
const models = (process.argv[3] ?? 'gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.8-flash').split(',')
const seed = process.env.SEED ?? ''
const list = (v?: string) => (v ? v.split(',').filter(Boolean) : [])
const include = list(process.env.INCLUDE)
const exclude = [...list(process.env.EXCLUDE), ...include]
const sql = postgres(process.env.DATABASE_URL!, { max: 2 })
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 120_000 } })
const schema = z.toJSONSchema(StructuredWelfare, { target: 'draft-2020-12' })

type Row = { id: string; name: string; city: string; source_url: string; content_md: string; source_fields: Record<string, unknown> }
const cols = sql`id, name, city, source_url, content_md, source_fields`
const base = sql`status <> 'removed' and program_key not like 'mock:%' and not (id::text = any(${exclude}))`
const rest = n - include.length
const long = Math.round(rest * 0.2)
// 分層抽樣：長文（會被截斷）、開放資料、其餘隨機
const rows = [
  ...(include.length ? await sql<Row[]>`select ${cols} from welfare_programs where id::text = any(${include})` : []),
  ...(await sql<Row[]>`
    (select ${cols} from welfare_programs p where ${base}
      and length(content_md) + coalesce((select sum(length(coalesce(text,''))) from welfare_attachments a where a.program_id = p.id), 0) > 16000
      order by md5(id::text || ${seed}) limit ${long})
    union all
    (select ${cols} from welfare_programs where ${base} and source_fields <> '{}'::jsonb
      order by md5(id::text || ${seed}) limit ${long})
    union all
    (select ${cols} from welfare_programs where ${base} and source_fields = '{}'::jsonb
      order by md5(id::text || ${seed} || 'x') limit ${rest - 2 * long})`),
]

const results: unknown[] = []
for (const r of rows) {
  const attachments = await sql<{ name: string; text: string }[]>`
    select name, coalesce(text, '') as text from welfare_attachments where program_id = ${r.id}`
  const input = buildInput({ title: r.name, city: r.city, contentMd: r.content_md, attachments, sourceFields: r.source_fields ?? {} })
  const byModel: Record<string, unknown> = {}
  await Promise.all(
    models.map(async (model) => {
      const t0 = Date.now()
      try {
        const res = await ai.models.generateContent({
          model,
          contents: input,
          config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 },
        })
        let out: unknown
        try { out = JSON.parse(res.text ?? '') } catch { out = res.text }
        const ok = StructuredWelfare.safeParse(out)
        byModel[model] = { ms: Date.now() - t0, usage: res.usageMetadata, valid: ok.success, issues: ok.success ? undefined : ok.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), out }
      } catch (e) {
        byModel[model] = { ms: Date.now() - t0, error: String((e as Error).message).slice(0, 300) }
      }
    }),
  )
  results.push({ id: r.id, title: r.name, city: r.city, sourceUrl: r.source_url, inputChars: input.length, byModel })
  console.error(`${results.length}/${rows.length} ${r.name.slice(0, 30)}`)
}
console.log(JSON.stringify(results, null, 2))
await sql.end()
