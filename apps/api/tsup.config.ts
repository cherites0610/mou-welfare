import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts', 'src/db/migrate.ts'],
  format: 'esm',
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // shared 以 TS 原始碼發布，打包進來；其他依賴維持外部
  noExternal: ['@mou-welfare/shared'],
})
