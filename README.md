# 哞福利 mou-welfare

一站式政府福利查詢平台（v2 重寫中）。

## 文件

| 文件 | 內容 |
|---|---|
| [`docs/backend.md`](docs/backend.md) | 後端架構（Hono on Node、Drizzle、Better Auth、pg-boss）與部署 |
| [`docs/scraper.md`](docs/scraper.md) | 爬蟲設計與 22 縣市資料來源調查 |
| [`docs/testing.md`](docs/testing.md) | 測試規範（權限矩陣、v1 回歸清單、CI 流程） |
| [`docs/v1/`](docs/v1/) | v1 的 API、頁面與樣式紀錄（用瀏覽器開 `index.html`） |

## 結構

```
apps/api           Hono API（Node，pm2 部署在自有主機）
apps/web           Nuxt 前端（部署在 Cloudflare Workers）
packages/shared    前後端共用：Zod schema、身分與類別白名單、年齡計算
services/scraper   Python 爬蟲（uv）
```

## 開發

需要 Node 24、pnpm 10、uv。

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build

# API（需要 apps/api/.env，參考 apps/api/src/env.ts；本機建議 MAIL_DRIVER=log，信件連結會印在終端機）
pnpm dev:api

# 前端（指向本機 API）
NUXT_PUBLIC_API_BASE=http://localhost:5031 pnpm dev:web
pnpm --filter @mou-welfare/api db:generate   # 修改 schema 後產生 migration
pnpm --filter @mou-welfare/api openapi       # 修改 API 後更新 openapi.json

# 爬蟲
cd services/scraper && uv sync && uv run pytest && uv run scrape sites
```

API 整合測試需要測試資料庫：CI 使用 `TEST_DATABASE_URL` 環境變數，本機則讀取 `apps/api/.env.test`（不進版控）。

## 舊版（v1）

舊版程式碼已封存為 tag，不在 `main` 上開發：

| Tag | 內容 | 原分支 |
|---|---|---|
| `v1-api` | NestJS 後端、Python 爬蟲 | `api` |
| `v1-web` | Vue 3 前端 | `web` |

v1 目前仍在正式環境運作，部署位置見 [`docs/backend.md` §10.4](docs/backend.md)。
