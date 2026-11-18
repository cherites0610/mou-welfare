import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.ts'

export type Db = ReturnType<typeof createDb>['db']

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, onnotice: () => {} })
  return { db: drizzle(sql, { schema, casing: 'snake_case' }), sql }
}
