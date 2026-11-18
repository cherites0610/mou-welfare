// 產生爬蟲端使用的 JSON Schema。加上 --check 時只比對，不一致就以非零結束（CI 契約檢查用）。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IngestItem, IngestRemove } from '../src/ingest.ts'

const targets = {
  'ingest.schema.json': IngestItem,
  'ingest-remove.schema.json': IngestRemove,
}

const check = process.argv.includes('--check')
let drift = false

for (const [file, schema] of Object.entries(targets)) {
  const path = fileURLToPath(new URL(`../schemas/${file}`, import.meta.url))
  const next = JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2) + '\n'
  if (check) {
    let current = ''
    try {
      current = readFileSync(path, 'utf8')
    } catch {}
    if (current !== next) {
      console.error(`schema drift: ${file}（請執行 pnpm --filter @mou-welfare/shared gen:schema）`)
      drift = true
    }
  } else {
    writeFileSync(path, next)
    console.log(`wrote schemas/${file}`)
  }
}

if (drift) process.exit(1)
