// 測試前重建資料表：刪除 public 中屬於本帳號的資料表與 drizzle / pgboss schema（保留 extension），再套用 migration。
import postgres from 'postgres'
import { runMigrations } from '../src/db/migrate.ts'
import { testDatabaseUrl } from './test-env.ts'

export default async function setup() {
  const url = testDatabaseUrl()
  if (!/mou_welfare_test|_test\b/.test(url)) throw new Error('拒絕執行：TEST_DATABASE_URL 看起來不是測試資料庫')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql`drop schema if exists drizzle cascade`
    await sql`drop schema if exists pgboss cascade`
    const tables = await sql<{ t: string }[]>`
      select quote_ident(tablename) as t from pg_tables where schemaname = 'public' and tableowner = current_user`
    if (tables.length) await sql.unsafe(`drop table ${tables.map((r) => r.t).join(', ')} cascade`)
  } finally {
    await sql.end()
  }
  await runMigrations(url)
}
