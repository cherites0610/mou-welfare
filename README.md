# 哞福利 mou-welfare

一站式政府福利查詢平台（v2 重寫中）。

| 環境 | 網址 |
|---|---|
| 使用者網站（v2 過渡期） | https://v2.mou-welfare.com |
| API | https://api-v2.mou-welfare.com（`/health`、`/openapi.json`） |
| 管理後台 | https://admin.mou-welfare.com |

## 文件

| 文件 | 內容 |
|---|---|
| [`docs/backend.md`](docs/backend.md) | 後端架構（Hono on Node、Drizzle、Better Auth、pg-boss）、LLM 結構化與回測、部署 |
| [`docs/admin.md`](docs/admin.md) | 管理後台：權限、頁面、福利人工檢核、稽核紀錄、部署 |
| [`docs/scraper.md`](docs/scraper.md) | 爬蟲設計與 22 縣市資料來源調查 |
| [`docs/testing.md`](docs/testing.md) | 測試規範（權限矩陣、v1 回歸清單、CI 流程） |
| [`docs/deploy-setup.md`](docs/deploy-setup.md) | GitHub Actions 自動部署的金鑰與 secrets（已設定完成，重建時參考） |
| [`docs/v1/`](docs/v1/) | v1 的 API、頁面與樣式紀錄（用瀏覽器開 `index.html`） |

## 結構

```
apps/api           Hono API（Node，pm2 部署在自有主機）
apps/web           Nuxt 前端（部署在 Cloudflare Workers）
apps/admin         管理後台（Nuxt 單頁應用，admin.mou-welfare.com；docs/admin.md）
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
pnpm dev:admin   # 後台 http://localhost:3001（API 的 TRUSTED_ORIGINS 要加上這個網址）
pnpm --filter @mou-welfare/api db:generate   # 修改 schema 後產生 migration
pnpm --filter @mou-welfare/api openapi       # 修改 API 後更新 openapi.json
pnpm --filter @mou-welfare/api exec tsx --env-file=.env scripts/seed-mock-welfare.ts   # 寫入置頂的範例福利（--remove 刪除；只在本機開發資料庫使用）
pnpm --filter @mou-welfare/api exec tsx --env-file=.env scripts/set-role.ts <email> admin   # 指定管理者（docs/admin.md §3）
pnpm --filter @mou-welfare/api eval:structure   # 結構化回測（呼叫 Gemini，約 0.25 美元；docs/backend.md §8.3.1）

# 主機上的維運（正式環境，env 檔為 ~/.config/mou-welfare/api.env）
#   scripts/llm-usage.ts     LLM 用量與費用（docs/backend.md §8.3.2）
#   scripts/restructure.ts   全量或部分重新結構化，先顯示預估費用，加 --yes 才執行（§8.4.1）
#   scripts/set-role.ts      指定或取消管理者

# 爬蟲（dry-run 結果寫到 services/scraper/out/，報告在 out/reports/）
cd services/scraper && uv sync && uv run pytest
uv run scrape sites
uv run scrape run --site kinmen --limit 10   # 試跑 10 筆
uv run scrape run --push                     # 推送到 API（需要 API_BASE、INGEST_HMAC_KEY；主機上在 ~/.config/mou-welfare/scraper.env）
uv run scrape replay out/<run_id>            # 推送人工檢查過的 dry-run 結果
uv run scrape sample out/<run_id>            # 產生抽查清單
```

API 整合測試需要測試資料庫：CI 使用 `TEST_DATABASE_URL` 環境變數，本機則讀取 `apps/api/.env.test`（不進版控）。

## 舊版（v1）

舊版程式碼已封存為 tag，不在 `main` 上開發：

| Tag | 內容 | 原分支 |
|---|---|---|
| `v1-api` | NestJS 後端、Python 爬蟲 | `api` |
| `v1-web` | Vue 3 前端 | `web` |

v1 目前仍在正式環境運作，部署位置見 [`docs/backend.md` §10.4](docs/backend.md)。
