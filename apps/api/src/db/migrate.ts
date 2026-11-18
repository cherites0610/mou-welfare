// 套用 drizzle/ 底下的 migration。部署時先執行，成功後才重啟程序（docs/backend.md §10.1）。
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDb } from './client.ts'

// 以執行目錄（apps/api）為準，打包後的 dist/migrate.js 也能找到
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'drizzle')

export async function runMigrations(url: string) {
  const { db, sql } = createDb(url, { max: 1 })
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await sql.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未設定')
  await runMigrations(url)
  console.log('migrations applied')
}
