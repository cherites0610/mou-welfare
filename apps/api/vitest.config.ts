import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    // 整合測試共用同一個測試資料庫，依序執行避免互相干擾
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
