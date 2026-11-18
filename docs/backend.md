# 後端設計文件（v2）

> 狀態：設計定案，尚未實作（資料庫基礎設施已建立，見第 9 節）
> 最後更新：2026-11-18
> 相關文件：[爬蟲設計](scraper.md)、[v1 文件](v1/)

---

## 1. 決策摘要

| 項目 | 決定 | 取代 v1 的 | 理由 |
|---|---|---|---|
| 部署 | **Cloudflare Workers**（Paid 方案） | 自架 Node | 不用管伺服器；台灣有 Cloudflare 機房；成本低 |
| 前端 | **Nuxt**（SSR，Cloudflare preset） | Vue SPA | 重視 SEO，福利列表和詳情頁需要伺服器端渲染 |
| API 框架 | **Hono** + `@hono/zod-openapi` | NestJS | 輕量，寫法就是一般函式，沒有 decorator 和 DI；Workers 原生支援 |
| 驗證與型別 | **Zod**（`packages/shared`） | class-validator DTO | 前後端共用同一份 schema，路徑和參數對不上時編譯就會報錯 |
| ORM | **Drizzle** | TypeORM | 型別嚴格、SQL 透明；避開 v1 的 `where: { x: undefined }` 撈到第一筆資料的陷阱 |
| 登入 | **Better Auth** | 自己寫的 JWT 與 OAuth | 內建 Email 密碼、Google、LINE（含 ID Token 登入，可直接給 LIFF 用） |
| 資料庫 | **自架 Postgres 16**（`postgres.cherites.org`），透過 **Hyperdrive** 連線 | 同一台主機 | 已在運作，不需額外費用；pgvector 和 pg_trgm 齊全 |
| 快取與佇列 | **不用 Redis**：佇列改用 **Cloudflare Queues**，排程改用 **Cron Triggers**，暫存資料放 Postgres | Redis + BullMQ | 少維護一套服務；Workers 無法常駐 BullMQ worker |
| 檔案 | **R2** | GCS | 沒有流量費，和 Workers 原生整合 |
| LLM | **`@google/genai`**，外面包自己的 `lib/llm` 介面 | openai SDK + 自己解析 JSON | 只依賴官方 SDK；之後換模型只需新增一個實作檔 |
| 爬蟲 | Python，部署在 **GCP asia-east1** | — | 需要台灣 IP、LibreOffice、長時間執行，Workers 做不到（見爬蟲文件） |

---

## 2. 系統架構

```
                     使用者（瀏覽器 / LINE LIFF）            LINE Platform
                                │                                 │ webhook
                                ▼                                 ▼
┌──────────────────────────── Cloudflare ─────────────────────────────────────┐
│                                                                              │
│  web Worker（Nuxt SSR）── service binding ──▶ api Worker（Hono）              │
│      mou-welfare.com                          api.mou-welfare.com            │
│                                                  │   │   │                   │
│                       ┌──────────────────────────┘   │   └──────────┐        │
│                       ▼                              ▼              ▼        │
│               Queues: welfare-structure        R2: uploads    AI Gateway ──▶ Gemini
│                       notify                                                 │
│                       ▼                                                      │
│               consumer Worker（同一份程式碼的另一個入口）                      │
│               Cron Triggers（截止日提醒、過期清理）                             │
│                       │                                                      │
│                       ▼                                                      │
│                   Hyperdrive（連線池 + 查詢快取）                              │
└───────────────────────┼──────────────────────────────────────────────────────┘
                        ▼
        Postgres 16 @ postgres.cherites.org（騰訊雲東京）
        DB: mou_welfare（pgvector / pg_trgm / pgcrypto）
                        ▲
                        │ HTTPS（HMAC 簽章）POST /internal/ingest
        爬蟲（Python）@ GCP asia-east1（台灣 IP）
```

---

## 3. Monorepo 結構

```
mou-welfare/
├── apps/
│   ├── web/                    # Nuxt
│   └── api/                    # Hono on Workers
│       ├── wrangler.jsonc
│       ├── drizzle.config.ts
│       ├── drizzle/            # migrations
│       └── src/
│           ├── index.ts        # fetch handler（HTTP）+ queue handler + scheduled handler
│           ├── app.ts          # 路由組裝、全域 middleware
│           ├── env.ts          # Bindings 型別（HYPERDRIVE、R2、QUEUE、secrets）
│           ├── db/
│           │   ├── client.ts   # 每個請求建立連線（Hyperdrive）
│           │   └── schema/     # 依功能拆檔
│           ├── features/
│           │   ├── auth/       # Better Auth 設定、LIFF、profile
│           │   ├── welfare/    # routes / service / matching / search
│           │   ├── family/
│           │   ├── favorite/
│           │   ├── chat/       # RAG、串流
│           │   ├── faq/
│           │   ├── upload/
│           │   ├── line-bot/   # webhook、回覆、Flex message
│           │   ├── notify/
│           │   └── ingest/     # 接收爬蟲資料 → Queue
│           ├── jobs/           # Queue consumers、cron 工作
│           └── lib/
│               ├── llm/        # 介面 + gemini.ts
│               ├── auth.ts     # 取得 session、權限 helper
│               ├── errors.ts
│               └── storage.ts  # R2
├── packages/
│   └── shared/                 # Zod schema、常數（身分與類別白名單）、型別
├── services/
│   └── scraper/                # 見 scraper.md
└── docs/
```

**慣例**
- 一個功能一個資料夾，裡面固定是 `routes.ts`（HTTP 層）、`service.ts`（商業邏輯，可單獨測試）、`schema.ts`（Zod）。
- 路由層只做：解析輸入、權限檢查、呼叫 service、回傳結果。
- **不寫 class、不用 DI**。依賴（db、env）用參數傳入。

---

## 4. Cloudflare Workers 的限制與對策

| 限制 | 影響 | 對策 |
|---|---|---|
| 免費方案每個請求只有 10ms CPU | Better Auth 的密碼雜湊（scrypt）一定會超過，社群有多起回報 | **使用 Workers Paid 方案**（每月 5 美元）；不要為了符合限制而降低雜湊強度 |
| 不能有常駐程序 | 無法使用 BullMQ、pg-boss | **Cloudflare Queues** 處理非同步工作，**Cron Triggers** 處理排程 |
| 非 Node 執行環境 | 部分 npm 套件不能用 | 開啟 `nodejs_compat`；選用的套件以支援 Workers 為準：Hono、Drizzle、`postgres`（driver）、Better Auth、`@google/genai` |
| 每次呼叫最多 6 個同時連線 | 資料庫連線要節省 | 每個請求只開一個連線，交給 Hyperdrive 做連線池 |
| Gemini 有地區限制 | 有社群回報從 Workers 呼叫 Gemini 出現「location error」（請求可能從不支援的地區送出，例如香港） | 所有 LLM 呼叫都經過 **Cloudflare AI Gateway**；若仍發生，固定 Worker 的執行位置。**P0 必須驗證** |
| Better Auth 加 Hyperdrive | 有社群回報兩者搭配時連線異常 | **P0 必須驗證**。備案：Better Auth 改用直接連線（不經 Hyperdrive），或把資料庫換成 Neon，用它的 serverless driver |
| 拿不到真實客戶端 IP（`X-Forwarded-For`） | 登入的限流規則會失準 | 改讀 `CF-Connecting-IP` header，在 Better Auth 設定中指定 |
| 長時間的 LLM 生成 | 單一請求有時間限制 | 聊天用串流（SSE）；福利結構化一律放進 Queue 處理 |

---

## 5. 資料模型（Drizzle / Postgres）

### 5.1 資料表

**帳號（由 Better Auth 管理）**：`user`、`session`、`account`、`verification`

`user` 加上這些欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `birthday` | `date` | 用來計算年齡（**用完整生日計算，不能只用年份相減**） |
| `gender` | `text` | `男性` / `女性` / null |
| `city` | `text` | 居住縣市 |
| `identities` | `text[]` | 身分白名單（定義在 `packages/shared`） |
| `role` | `text` | `user` / `admin` |

**家庭**

```
families(id uuid pk, name, created_by → user, created_at)
family_members(family_id → families, user_id → user, role 'admin'|'member', joined_at, pk(family_id, user_id))
family_invites(code text pk, family_id, created_by, expires_at, used_at)        -- 取代 v1 存在 Redis 的邀請碼
```

**福利**

```
welfare_programs(
  id uuid pk,
  program_key text unique,          -- 爬蟲產生，例如 "kinmen:中低收入老人生活津貼"，用來合併跨年度的同一福利
  city text, name text,
  categories text[], identities text[],
  summary text, requirements text[], rewards text[],
  content_md text,                  -- 原文（Markdown），附件文字另存
  source_url text, source_kind text,  -- cms | opendata | portal
  published_at date, deadline date,
  status text,                      -- active | expired | removed
  content_hash text,                -- 內容沒變就不重新交給 LLM
  embedding vector(768),            -- RAG 用
  created_at, updated_at
)
welfare_attachments(id, program_id, name, url, text)
favorites(user_id, program_id, created_at, pk(user_id, program_id))
```

**其他**

```
faqs(id, question, answer, sort, published)
chat_sessions(id, user_id, family_id null, title, options jsonb, created_at, updated_at)
chat_messages(id, session_id, role, content, metadata jsonb, created_at)
notification_log(id, user_id, channel, template, payload jsonb, status, sent_at)
ingest_log(id, program_key, action, content_hash, received_at, processed_at, error)
```

### 5.2 索引

| 用途 | 索引 |
|---|---|
| 身分、類別篩選 | `GIN (identities)`、`GIN (categories)`，查詢用 `&&` 或 `@>`（修正 v1 對 simple-array 用 `IN` 比對錯誤的問題） |
| 中文關鍵字搜尋 | `GIN (name gin_trgm_ops)`、`GIN (summary gin_trgm_ops)` |
| RAG 語意搜尋 | `HNSW (embedding vector_cosine_ops)` |
| 縣市與狀態 | `btree (city, status)` |

### 5.3 規則

- 所有查詢都經過 Drizzle，**禁止把可能是 `undefined` 的值放進 where 條件**；身分驗證相關的查詢一律寫成必填參數。
- Migration 用 `drizzle-kit generate` 產生 SQL 檔並進版控，正式環境用 `drizzle-kit migrate` 套用，**不用 `synchronize`**。

---

## 6. API 設計

前綴 `/v1`，回應統一為 `{ data }` 或 `{ error: { code, message } }`。OpenAPI 由 `@hono/zod-openapi` 自動產生；Nuxt 端用 orval 產生 client，或直接引用 `packages/shared` 的型別。

| 群組 | 端點 | 權限 |
|---|---|---|
| 登入 | `/v1/auth/*`（由 Better Auth 處理：Email 密碼、Google、LINE、LIFF ID Token、驗證信、重設密碼） | 公開 |
| 個人 | `GET/PATCH /v1/me`、`DELETE /v1/me` | 登入 |
| 收藏 | `GET /v1/me/favorites`、`PUT/DELETE /v1/me/favorites/:programId` | 登入 |
| 福利 | `GET /v1/welfare?q=&city=&category=&familyId=&page=`、`GET /v1/welfare/:id` | 公開；**帶比對結果時以登入身分為準**，不再接受從前端傳 `userId` |
| 試算 | `POST /v1/welfare/simulate`（手動輸入身分試算） | 公開 |
| 家庭 | `GET/POST /v1/families`、`GET/PATCH/DELETE /v1/families/:id` | 登入；查看需為成員，修改或刪除需為 admin |
| 成員 | `GET /v1/families/:id/members`、`PATCH/DELETE /v1/families/:id/members/:userId` | 成員 / admin |
| 邀請 | `POST /v1/families/:id/invites`、`POST /v1/invites/:code/accept` | admin / 登入 |
| 聊天 | `GET/POST /v1/chat/sessions`、`GET/DELETE /v1/chat/sessions/:id`、`POST /v1/chat/sessions/:id/messages`（SSE 串流） | 登入，且需為 session 擁有者 |
| FAQ | `GET /v1/faq`；`POST/PATCH/DELETE /v1/admin/faq/*` | 公開 / admin |
| 上傳 | `POST /v1/uploads`（回傳 R2 的上傳 URL 或直接代傳，限制圖片格式與大小） | 登入 |
| LINE | `POST /v1/line/webhook` | **驗證 `x-line-signature`**（HMAC-SHA256，用原始 body 計算） |
| 爬蟲 | `POST /internal/ingest`、`POST /internal/remove` | **HMAC 簽章加時間戳**，金鑰未設定時一律拒絕 |
| 管理 | `/v1/admin/*`（福利人工修正、重新結構化、查看隔離區） | admin |

---

## 7. 權限模型

**預設拒絕**：全域 middleware 要求登入，公開端點必須明確標記 `public()`。這是為了修正 v1 中好幾個端點忘了加 Guard 的問題，例如 `/upload` 和家庭相關端點。

```ts
app.use('/v1/*', requireSession({ except: publicRoutes }))
```

資源層級的檢查集中寫成 helper，每個路由都必須呼叫：

```ts
await assertFamilyMember(db, familyId, user.id)         // 403 if not
await assertFamilyAdmin(db, familyId, user.id)
await assertChatOwner(db, sessionId, user.id)
```

| v1 的漏洞 | v2 的做法 |
|---|---|
| `POST /welfare` 可帶任意 `userId` / `familyId` | 比對對象只能是自己，或自己是成員的家庭 |
| 聊天的 session 沒檢查擁有者 | `assertChatOwner` |
| 任何登入者都能修改或刪除任何家庭 | `assertFamilyAdmin` |
| `POST /user-families` 可以把任何人加進任何家庭 | 移除這個端點，只能透過邀請碼加入 |
| `PATCH /users/:id` 可以修改 `lineId`、`googleId` | 綁定和解除綁定只走 Better Auth 的 account linking 流程 |
| API key 未設定時，`undefined === undefined` 會通過驗證 | 啟動時檢查必要的 secret，缺少就直接報錯；比對時使用 timing-safe compare |
| LINE webhook 沒驗證簽章 | 必驗 |
| LIFF 登入時 email 為 undefined 會撈到第一個使用者 | 交給 Better Auth 的 LINE ID Token 登入，不自己寫查詢 |

---

## 8. 功能細節

### 8.1 資格比對（紅黃綠燈）

保留 v1 的規則，修正已知問題：
- 年齡用完整生日計算，不能只用年份相減。
- 身分白名單和相容規則（例如低收入戶也符合中低收入戶的條件）移到 `packages/shared`，前後端共用。
- 比對寫成純函式 `match(profile, program) → { light, score, reasons }`，加上單元測試。
- 家庭模式：一次撈出成員資料，在記憶體中比對，排序權重沿用 v1 的公式：本人分數 × 1000 + 家人最高分。

### 8.2 搜尋

- 先用 SQL 篩選：縣市、類別、身分重疊（`&&`）、關鍵字（pg_trgm 相似度）、`status = 'active'`。
- 只對當頁的資料做資格比對，不再像 v1 一樣把所有資料載入記憶體再分頁。
- 排序：有身分限制的福利優先，其次是比對分數，再來是發布日期。

### 8.3 LLM（`lib/llm`）

```ts
export interface LLM {
  generate<T>(o: { system: string; input: string | Part[]; schema: z.ZodType<T>; model?: string }): Promise<T>
  stream(o: { system: string; messages: Message[] }): AsyncIterable<string>
  embed(texts: string[]): Promise<number[][]>
}
```

- **實作**：`gemini.ts`（`@google/genai`），全部經過 AI Gateway，可以快取、限流、看用量。
- **結構化輸出**：用 `z.toJSONSchema()` 把 Zod schema 轉成 Gemini 的 `responseSchema`，回傳後再用 Zod 驗證；不合格就重試一次，帶上錯誤訊息。
- **Embedding**：用 Gemini 的 embedding 模型輸出 768 維（實作時確認模型支援自訂輸出維度）。

| 用途 | 時機 | 執行位置 |
|---|---|---|
| 福利結構化 | 爬蟲送來新增或更新的資料 | Queue consumer |
| Embedding | 結構化完成後 | 同一個 consumer |
| 阿哞聊天（RAG） | 使用者發問 → 向量搜尋取前 k 筆，加上資格比對 → 串流回答 | api Worker（SSE） |

### 8.4 背景工作

| 名稱 | 類型 | 內容 |
|---|---|---|
| `welfare-structure` | Queue | 結構化、embedding、寫回資料庫；失敗重試 3 次後進入 dead letter queue |
| `notify` | Queue | Email（Resend）、LINE push |
| `deadline-reminder` | Cron（每日） | 通知收藏的福利即將截止 |
| `expire` | Cron（每日） | 把超過截止日的福利標為 `expired` |
| `cleanup` | Cron（每週） | 清除過期的邀請碼、session、verification |

### 8.5 LINE Bot

- **驗證**：webhook 收到後先驗證簽章，再用 `ctx.waitUntil()` 非同步處理，立即回應 200。
- **已綁定的使用者**：交給聊天服務回答，回覆文字加上福利 Flex carousel。
- **未綁定的使用者**：引導到 LIFF 登入，並推薦福利。

---

## 9. 資料庫基礎設施（已完成）

2026-11-18 在 `postgres.cherites.org`（騰訊雲東京，2 vCPU、1.9 GB RAM）完成以下設定：

| 項目 | 狀態 |
|---|---|
| Postgres 版本 | 16.11，SSL 已開啟 |
| pgvector | ✅ 已安裝 0.6.0（Ubuntu 套件 `postgresql-16-pgvector`，支援 HNSW） |
| 資料庫 | ✅ `mou_welfare`（UTF8、`C.UTF-8`），擁有者為 `mou_welfare` |
| 擴充 | ✅ `vector 0.6.0`、`pg_trgm 1.6`、`pgcrypto 1.3` |
| 帳號 | ✅ `mou_welfare`（LOGIN，非 superuser，連線上限 30），只有自己的資料庫有 CONNECT 權限 |
| 連線字串 | 存在主機上的 `~/.config/mou-welfare/db.env`（權限 600）和 `~/.pgpass`，**不進版控** |
| 每日備份 | ✅ `~/.local/bin/mou-welfare-backup.sh`，crontab 每天 03:17（主機時區 UTC+8）執行；`pg_dump -Fc` 存到 `~/backups/mou-welfare/`，保留 30 天；日誌在 `~/.local/state/mou-welfare-backup.log` |
| R2 異地備份 | ✅ bucket `mou-welfare-backups`，lifecycle 規則 `expire-daily-30d`（`daily/` 前綴 30 天後刪除）；2026-11-18 測試上傳並下載比對，內容一致 |
| 連線測試 | ✅ 透過 `postgres.cherites.org` 以 `sslmode=require` 連線成功（TLSv1.3） |

> 舊版資料庫 `mou-welfare`（連字號，擁有者為 `cherites`）保留不動，作為 v1 資料參考。

**已知限制**
- `mou_welfare` 帳號可以連線到同一台主機上的 `pet-erp`、`lexicon`、`mou-welfare`，因為這些資料庫保留了預設的 PUBLIC CONNECT 權限。實測**任何資料表都不可讀，也無法建立物件**。若要完全拒絕連線，需要在 `pg_hba.conf` 加一條 `reject` 規則（尚未執行，見第 11 節）。
- 5432 port 目前對外開放（`pg_hba` 允許 `0.0.0.0/0` 用密碼連線，`ufw` 未啟用）。依目前決定**暫不變更**，之後改用 Cloudflare Tunnel 加 Hyperdrive，就能關閉對外開放。

---

## 10. 部署

| 元件 | 方式 |
|---|---|
| web / api / consumer | `wrangler deploy`，分 `dev`、`prod` 兩個環境；由 GitHub Actions 在合併到 `main` 時部署 |
| Secrets | `wrangler secret put`：`BETTER_AUTH_SECRET`、`GOOGLE_*`、`LINE_*`、`GEMINI_API_KEY`、`RESEND_API_KEY`、`INGEST_HMAC_KEY` |
| 資料庫連線 | Hyperdrive 設定指向 `postgres.cherites.org:5432/mou_welfare`（`sslmode=require`）；之後改成 Tunnel 時只需改 Hyperdrive 設定 |
| Migration | CI 中執行 `drizzle-kit migrate`（直接連資料庫，不經過 Hyperdrive） |
| 網域 | `mou-welfare.com` 指向 web；`api.mou-welfare.com` 指向 api |
| 監控 | Workers Logs 和 Analytics；錯誤追蹤可選 Sentry（有 Cloudflare 的整合套件） |

**預估月費（初期）**：Workers Paid 5 美元；R2、Queues、Hyperdrive 在免費額度內；資料庫用現有主機不另計；Gemini 依用量計費。

---

## 11. 待辦與待確認

**需要你處理**
- [x] ~~到 Cloudflare Dashboard 啟用 R2~~（已完成）
- [x] ~~建立 bucket `mou-welfare-backups` 與 30 天 lifecycle 規則~~（已完成）
- [ ] **作廢並重發（Roll）備份用的 API Token**：舊 token 在設定過程中外洩到對話紀錄。重發後填回 `~/.config/mou-welfare/backup.env`，格式為 `CLOUDFLARE_API_TOKEN=...`。
- [x] ~~建立 R2 API Token 並填入 `backup.env`~~（已完成，但需重發，見上一項）
- [x] ~~確認騰訊雲安全群組對 5432 port 的規則~~（已確認沒問題）

**之後再決定**
- [ ] `pg_hba.conf` 加入規則，限制 `mou_welfare` 只能連自己的資料庫。
- [ ] 改用 Cloudflare Tunnel 加 Hyperdrive，關閉 5432 對外開放。
- [ ] pgvector 要不要升級：改用 PostgreSQL 官方的 PGDG 套件庫，可以裝到較新的版本（目前 0.6.0 已夠用）。
- [ ] 從 v1 資料庫 `mou-welfare` 搬資料（使用者、家庭、收藏）的範圍和方式。

**P0 原型必須驗證**
- [ ] Better Auth 加 Hyperdrive 加 Drizzle 在 Workers 上能正常運作（註冊、登入、LINE ID Token 登入）。
- [ ] 從 Workers 經 AI Gateway 呼叫 Gemini，沒有地區錯誤。
- [ ] 東京資料庫加 Hyperdrive 的 API 延遲（目標 p95 < 300ms）。

---

## 12. 推進計畫

| 階段 | 內容 | 完成標準 |
|---|---|---|
| **P0 骨架與驗證** | monorepo（pnpm）、`packages/shared`、api Worker（Hono + Drizzle + Better Auth + Hyperdrive）、Gemini 經 AI Gateway 呼叫測試 | 第 11 節三項驗證全部通過，或確定改走備案 |
| **P1 核心 API** | 個人資料、福利搜尋與詳情、資格比對、收藏、FAQ、權限 middleware | 單元測試涵蓋比對邏輯和權限 helper；OpenAPI 文件產出 |
| **P2 資料流** | `/internal/ingest`、Queue 結構化、embedding、和爬蟲 P0 對接 | 爬蟲推送 3 個縣市的資料，可以搜尋得到 |
| **P3 家庭與聊天** | 家庭、邀請碼、聊天 RAG 串流 | — |
| **P4 LINE 與通知** | LINE webhook、LIFF 登入、Email 和 LINE 通知、Cron 工作 | — |
| **P5 前端串接與上線** | Nuxt 串接 API、SEO（sitemap、JSON-LD）、正式部署 | — |

---

## 參考來源

- [Better Auth – LINE](https://better-auth.com/docs/authentication/line)、[Better Auth – Cloudflare Guide](https://better-auth.com/docs/guides/cloudflare.md)、[Hono – Better Auth on Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
- [Cloudflare AI Gateway – Google AI Studio](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio)
- 社群回報：[Workers CPU exceeded（Better Auth）](https://answeroverflow.com/m/1344293536778031144)、[Better Auth + Hyperdrive](https://www.answeroverflow.com/m/1357795265108512808)、[Gemini location error from Workers](https://discuss.ai.google.dev/t/gemini-api-location-error-400-when-called-from-cloudflare-workers/188368)
