import { readFileSync } from 'node:fs'
import type { Env } from '../src/env.ts'
import { loadEnv } from '../src/env.ts'

/** CI 由環境變數提供；本機從 apps/api/.env.test 讀取 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  try {
    const line = readFileSync(new URL('../.env.test', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('TEST_DATABASE_URL='))
    if (line) return line.slice('TEST_DATABASE_URL='.length)
  } catch {}
  throw new Error('找不到 TEST_DATABASE_URL（CI 設定環境變數；本機建立 apps/api/.env.test）')
}

export function testEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
    BETTER_AUTH_URL: 'http://localhost:5030',
    TRUSTED_ORIGINS: 'http://localhost:3000',
    INGEST_HMAC_KEY: 'test-hmac-key-test-hmac-key-test-hmac',
    ...overrides,
  })
}
