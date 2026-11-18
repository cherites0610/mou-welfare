import { defineConfig } from 'vitest/config'

// 覆蓋率門檻（docs/testing.md §9.1）：整體 90%；資格比對與年齡計算分支 100%
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        'src/matching.ts': { branches: 100, lines: 100 },
        'src/age.ts': { branches: 100, lines: 100 },
      },
    },
  },
})
