import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    // 整合測試共用同一個測試資料庫，依序執行避免互相干擾
    fileParallelism: false,
    testTimeout: 20_000,
    // 覆蓋率門檻（docs/testing.md §9.1）：整體 75%；權限控制分支 100%
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/worker.ts', 'src/db/migrate.ts', 'src/db/schema/**'],
      thresholds: {
        lines: 75,
        'src/access.ts': { branches: 100, lines: 100 },
      },
    },
  },
})
