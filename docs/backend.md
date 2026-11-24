# 後端設計文件（v2）

> 狀態：實作中（P1 核心 API、P2 資料流與 LLM 結構化、家庭與帳號管理、LINE / LIFF 登入、管理後台已上線；Google 登入待設定金鑰；前端除 LINE Bot 外已上線，見第 12 節）
> 最後更新：2026-11-24（切換到正式網域、v1 停用並移除；聊天 SSE 經過 Cloudflare 實測通過）

> 相關文件：[管理後台](admin.md)、[爬蟲設計](scraper.md)、[測試規範](testing.md)、[自動部署設定](deploy-setup.md)、[v1 文件](v1/)

---

## 1. 決策摘要

> 2026-11-18 調整：**API 改部署在自有主機**（`postgres.cherites.org` 這台），前端 Nuxt 維持在 Cloudflare。目的是避開 Workers 的執行時間、CPU、常駐程序等限制。

| 項目 | 決定 | 取代 v1 的 | 理由 |
|---|---|---|---|
| 前端 | **Nuxt**（SSR），部署在 **Cloudflare Workers** | Vue SPA（由主機上的 Caddy 提供） | 重視 SEO，伺服器端渲染在 Cloudflare 機房執行（台灣有機房），也分擔主機記憶體 |
| 管理後台 | **Nuxt 單頁應用**（`apps/admin`），靜態檔部署在 Cloudflare Workers（`admin.mou-welfare.com`） | — | 和使用者網站分開部署；不需要 SEO，見 [admin.md](admin.md) |
| API 部署 | **自有主機**（騰訊雲東京，2 vCPU / 2 GB），**pm2** 管理程序，**Caddy** 反向代理與自動 HTTPS | 同一台主機上的 pm2 + Caddy | 沒有 Workers 的 CPU 和時間限制；資料庫在同一台，延遲最低 |
| API 框架 | **Hono** on Node（`@hono/node-server`）+ `@hono/zod-openapi` | NestJS | 輕量，寫法就是一般函式，沒有 decorator 和 DI；之後要搬到 Workers 也幾乎不用改 |
| 驗證與型別 | **Zod**（`packages/shared`） | class-validator DTO | 前後端共用同一份 schema，路徑和參數對不上時編譯就會報錯 |
| ORM | **Drizzle**（driver：`postgres`） | TypeORM | 型別嚴格、SQL 透明；避開 v1 的 `where: { x: undefined }` 撈到第一筆資料的陷阱 |
| 登入 | **Better Auth** | 自己寫的 JWT 與 OAuth | 內建 Email 密碼、Google、LINE（含 ID Token 登入，可直接給 LIFF 用） |
| 資料庫 | **Postgres 16**，和 API 在同一台，透過 localhost 連線 | 同一台主機 | 已建立 `mou_welfare`；pgvector 和 pg_trgm 齊全 |
| 佇列與排程 | **pg-boss**（佇列與 cron 都存在 Postgres） | Redis + BullMQ | 不需要 Redis；工作和業務資料在同一個資料庫，可以一起備份 |
| 檔案 | **R2**（透過 S3 相容 API） | GCS | 沒有流量費；Nuxt 端也能直接取用 |
| LLM | **`@google/genai`**，外面包自己的 `lib/llm` 介面 | openai SDK + 自己解析 JSON | 只依賴官方 SDK；之後換模型只需新增一個實作檔。主機在日本，不會遇到 Gemini 的地區限制 |
| 爬蟲 | Python，部署在 **GCP asia-east1** | — | 需要台灣 IP（見爬蟲文件）；資料透過 API 推送，不直接連資料庫 |

---

## 2. 系統架構

```
        使用者（瀏覽器 / LINE LIFF）                          LINE Platform
                 │                                                 │ webhook
                 ▼                                                 │
┌──────── Cloudflare ────────┐                                     │
│ web Worker（Nuxt SSR）       │                                     │
│ mou-welfare.com             │                                     │
│  ├─ 頁面渲染（SEO）           │                                     │
│  └─ server 端呼叫 API ───────┼──────────┐                          │
│ admin Worker（靜態檔）        │          │                          │
│ admin.mou-welfare.com ──────┼──────────┤ /v1/admin/*              │
│ R2（使用者上傳的圖片）         │◀──┐      │                          │
└─────────────────────────────┘   │      ▼                          ▼
                                  │   ┌──────── 自有主機（騰訊雲東京）────────────┐
                                  │   │ Caddy（HTTPS）api.mou-welfare.com         │
                                  │   │   └▶ pm2: mou-welfare-v2-api（Hono）       │
                                  └───┼──────  ├─ HTTP API / LINE webhook / SSE    │
                                      │        └─ 背景工作（同一程序，pg-boss：     │
                                      │           結構化、通知、cron）             │
                                      │                  │                         │
                                      │   Postgres 16（localhost）DB: mou_welfare   │
                                      │   每日備份 → 本機 + R2                      │
                                      └──────────────────▲──────────────────────────┘
                                                         │ HTTPS（HMAC 簽章）
                                    爬蟲（Python）@ GCP asia-east1 ── POST /internal/ingest
                                                                         Gemini API ◀─ api 程序
```

**網域**
- `mou-welfare.com`：Nuxt（Cloudflare Workers）。2026-11-24 起由 v2 提供（切換前的 `v2.mou-welfare.com` 同日移除）。
- `admin.mou-welfare.com`：管理後台（Cloudflare Workers 靜態檔，[admin.md](admin.md)）
- `api.mou-welfare.com`：主機上的 Caddy，代理到 v2 API（2026-11-24 起；切換前的 `api-v2.mou-welfare.com` 同日移除）。

---

## 3. Monorepo 結構

```
mou-welfare/
├── apps/
│   ├── web/                    # Nuxt（使用者網站）
│   ├── admin/                  # Nuxt 單頁應用（管理後台，admin.md）
│   └── api/                    # Hono on Node（pm2）
│       ├── ecosystem.config.cjs  # pm2：預設只有 api 一個程序
│       ├── drizzle.config.ts
│       ├── drizzle/            # migrations
│       ├── eval/               # 結構化回測的評測集（§8.3.1）
│       ├── scripts/            # 主機上的維運腳本：restructure、llm-usage、set-role、eval-structure、compare-llm、seed-mock-welfare、openapi
│       └── src/
│           ├── server.ts       # HTTP 入口（@hono/node-server）
│           ├── worker.ts       # 獨立背景工作入口，只在 WORKER_MODE=separate 時使用
│           ├── app.ts          # 路由組裝、全域 middleware
│           ├── env.ts          # 環境變數驗證（Zod，缺少必要值就拒絕啟動）
│           ├── db/
│           │   ├── client.ts   # 連線池（postgres driver，連 localhost）
│           │   └── schema/     # 依功能拆檔
│           ├── access.ts       # 路由存取表與權限 middleware（public / optional / user / admin / hmac / line）
│           ├── features/
│           │   ├── me/         # 個人資料、刪除帳號
│           │   ├── welfare/    # routes / service / search / structure（LLM 與規則結構化）
│           │   ├── family/
│           │   ├── favorite/
│           │   ├── faq/
│           │   ├── upload/
│           │   ├── ingest/     # 接收爬蟲資料 → Queue
│           │   ├── admin/      # 管理端 /v1/admin/*（admin.md）
│           │   ├── health/
│           │   ├── chat/       # 阿哞聊天：規則解析、混合檢索、SSE 串流（§8.9）
│           │   ├── line-bot/   # （P4）webhook、回覆、Flex message
│           │   └── notify/     # （P4）
│           ├── jobs/           # pg-boss 的工作與 cron；startJobs() 由 server.ts 或 worker.ts 呼叫；llm-pause.ts（§8.4.1）
│           └── lib/
│               ├── llm/        # 介面、gemini.ts、pricing.ts（價格表）、recorder.ts（用量寫入 llm_calls）
│               ├── auth.ts     # 取得 session、權限 helper
│               ├── queue.ts    # pg-boss 封裝（send / work / schedule）
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

## 4. 部署環境的限制與對策

| 項目 | 狀況 | 對策 |
|---|---|---|
| 主機資源 | 2 vCPU、1.9 GB RAM、1.9 GB swap；同時跑 Postgres、v1 API、lexicon API、Caddy、Redis（v1 用）。2026-11-18 時已用約 1 GB，swap 用了 234 MB | v2 預設只跑一個程序（背景工作在 API 程序內，實測 150 MB），以 pm2 `max_memory_restart: 300M` 限制；v1 下線後停掉 v1 API 和 Redis，可以釋放約 200 MB；持續觀察 swap 使用量 |
| 單點故障 | 主機掛了，API 就停 | 每日備份本機加 R2；記錄重建步驟（見第 10 節）；Nuxt 在 Cloudflare，API 掛掉時頁面仍能顯示錯誤提示 |
| 長時間工作 | LLM 結構化、批次通知 | 一律放進 pg-boss 佇列，由同一程序內的背景工作處理；結構化一次處理一筆（實測每筆約 1.3 秒，全量 1,471 筆約 37 分鐘），避免影響 API 回應。工作量變大時改 `WORKER_MODE=separate` 拆成獨立程序（不需改程式） |
| 聊天串流 | SSE 長連線經過 Cloudflare 和 Caddy | 回應加 `cache-control: no-transform`、`x-accel-buffering: no`；2026-11-24 正式環境實測逐段出現，沒有被緩衝 |
| Nuxt on Workers | 伺服器端渲染時呼叫 API 會跨區到東京 | 熱門頁面（福利列表、詳情）用 Nuxt 的路由規則做 SWR 快取；登入後的個人化資料改由瀏覽器端呼叫 |
| 真實客戶端 IP | 經過 Cloudflare 和 Caddy，IP 會被換掉 | Caddy 設定 `trusted_proxies` 為 Cloudflare 的 IP 段；Better Auth 的限流讀 `CF-Connecting-IP` |
| 背景工作模式 | 預設 `WORKER_MODE=inline`：pg-boss 在 API 程序內處理佇列與 cron，省下一個程序（約 120 MB）；代價是 API 重啟時進行中的工作會中斷 | pg-boss 自動重試，工作設計為冪等（重複執行結果不變）；`/health` 回報 `jobs.mode` 與心跳 |
| 與 v1 共存 | v1 API 在同一台主機的 5009 port | v2 用不同 port（5030）和不同的 pm2 名稱（`mou-welfare-v2-*`）；兩者使用不同資料庫 |

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
| `role` | `text` | `user` / `admin`；只能用主機上的 `scripts/set-role.ts` 修改（[admin.md](admin.md) §3） |
| `is_subscribed` | `boolean` | 是否接收福利資訊通知（P4） |

**家庭**

```
families(id uuid pk, name, created_by → user, created_at)
family_members(family_id → families, user_id → user, role 'admin'|'member', joined_at, pk(family_id, user_id))
family_invites(code text pk, family_id, created_by, expires_at, used_at, used_by, created_at)  -- 取代 v1 存在 Redis 的邀請碼；6 碼、一次性，3 天內有效
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
  status text,                      -- pending（待結構化，不出現在搜尋）| active | rejected（不是個人福利）| expired | removed
  site_id text, source_fields jsonb,  -- 爬蟲站點；開放資料原本的結構化欄位
  structured_hash text, structured_by text, structured_at, structure_error,  -- 結構化時的 content_hash、llm | rules
  structured_model text, structured_prompt_version text,  -- 目前結果由哪個模型、哪一版 prompt 產生（§8.3.2）
  content_hash text,                -- 內容沒變就不重新交給 LLM
  status_override text, reviewed_by, reviewed_at, review_note,  -- 管理者的人工判定（active | rejected），結構化不覆蓋（admin.md §4.3）
  pinned_at timestamptz,            -- 置頂：搜尋結果排最前面（越晚置頂越前面）；由管理後台設定
  embedding vector(768),            -- RAG 用
  created_at, updated_at
)
welfare_attachments(id, program_id, name, url, text)
favorites(user_id, program_id, created_at, pk(user_id, program_id))
```

**其他**

```
faqs(id, question, answer, sort, published)
chat_sessions(id, user_id, family_id null, title, filters jsonb, created_at, updated_at)   -- filters：上一輪的條件，追問時沿用（§8.9）
chat_messages(id, session_id, role, content, metadata jsonb, created_at)
chat_usage(user_id, day date, count, pk(user_id, day))   -- 每人每日訊息數（臺北時間），刪除對話不會歸零（§8.9）
  -- assistant 的 metadata：sources（福利 id 與燈號）、filters、mode（llm | fallback）、model、tokens
notification_log(id, user_id, channel, template, payload jsonb, status, sent_at)
ingest_log(id, program_key, source_url, action, content_hash, received_at)   -- action: created | updated | unchanged | removed
welfare_sources(url pk, program_id, site_id, content_hash, first_seen_at, last_seen_at)
  -- 一個福利可能來自多個網址（同一福利出現在多個分類）；所有網址都下架才把福利標為 removed
llm_calls(id, created_at, purpose, program_id, model, prompt_version, attempt, input/output/thoughts/total_tokens,
          input_chars, latency_ms, ok, error_kind, error, cost_usd)   -- 每次 LLM 呼叫的用量（§8.3.2）
llm_pause(name pk, reason, paused_at, probed_at)                      -- 額度不足暫停中（§8.4.1）
admin_audit(id, at, admin_id, admin_email, action, target_type, target_id, detail jsonb, ip)  -- 管理端稽核（admin.md §5）
worker_heartbeat(name pk, beat_at)                                    -- 背景工作心跳（/health）
scrape_runs(id pk, trigger, status, interval_days, planned, current, sites jsonb, started_at, finished_at, updated_at)
                                                                      -- 爬蟲每次執行的回報（admin.md §4.6）
alert_state(key pk, value, sent_at)                                   -- 系統通知的去重（§8.4.2）
```

`notification_log` 為 P4 預定，尚未建立。

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
| 個人 | `GET/PATCH /v1/me`（含 `isSubscribed` 訂閱通知、`createdAt`）、`DELETE /v1/me`（body 必須有 `"confirm":"DELETE"`；有密碼的帳號另需 `password`） | 登入 |
| 收藏 | `GET /v1/me/favorites?familyId=`、`PUT/DELETE /v1/me/favorites/:programId` | 登入 |
| 福利 | `GET /v1/welfare?q=&city=&category=&topic=&familyId=&page=`、`GET /v1/welfare/:id?familyId=`、`GET /v1/sitemap`（上架中福利的 id 與更新時間，前端產生 `sitemap.xml` 用）、`GET /v1/topics`（主題頁用的筆數：縣市 × 類別、全國、人生階段主題）、`GET /v1/highlights`（列表頂端的精選區塊：置頂的精選福利、30 天內截止的福利）。全國性福利的 `city` 為「全國」，依縣市篩選時一併列出；精選福利寫在 `apps/api/src/curated`（人工整理、附官方連結與最後確認日期），API 啟動時同步進資料庫（`program_key` 為 `curated:*`、`source_kind` 為 `curated`、人工判為福利、精選的置頂；截止日以人工寫的為準，結構化不覆蓋；從清單移除的標為 `removed`）。`topic` 是人生階段主題（`packages/shared/src/topics.ts`，以關鍵字比對名稱與摘要），前端的主題頁 `/topics/:slug`、`/cities/:city`、`/cities/:city/:category` 用它產生可被搜尋引擎收錄的清單頁 | 公開；**帶比對結果時以登入身分為準**，不再接受從前端傳 `userId`；帶 `familyId` 時必須登入（401）且為成員（403）。列表只有 `active`；詳情只開放 `active` 與 `expired`（標示已過期），`pending`、`rejected`、`removed` 一律 404，收藏也一樣 |
| 試算 | `POST /v1/welfare/simulate`（手動輸入身分試算；`identities` 可直接指定年齡組與性別，對應前端的「進階篩選」） | 公開 |
| 家庭 | `GET/POST /v1/families`、`GET/PATCH/DELETE /v1/families/:id` | 登入；查看需為成員，修改或刪除需為 admin |
| 成員 | `GET /v1/families/:id/members`、`PATCH/DELETE /v1/families/:id/members/:userId` | 成員 / admin |
| 邀請 | `POST /v1/families/:id/invites`、`GET /v1/invites/:code`（加入前預覽：家庭名稱與人數）、`POST /v1/invites/:code/accept` | admin / 登入 |
| 聊天 | `GET/POST /v1/chat/sessions`、`GET/DELETE /v1/chat/sessions/:id`、`POST /v1/chat/sessions/:id/messages`（SSE 串流） | 登入，且需為 session 擁有者 |
| FAQ | `GET /v1/faq` | 公開。2026-11-23 起前端常見問題直接寫死在 `apps/web/app/utils/faqs.ts`（v1 的 10 題原文），不呼叫這個端點，也不做管理端點；端點保留給部署煙霧測試使用，資料表目前是空的 |
| 上傳 | `POST /v1/uploads/avatar`（multipart；以內容判斷格式，只收 JPEG/PNG/WebP/GIF，上限 5 MB；壓縮為 512×512 WebP 並移除 EXIF 後存到 R2） | 登入 |
| LINE | `POST /v1/line/webhook` | **驗證 `x-line-signature`**（HMAC-SHA256，用原始 body 計算） |
| 爬蟲 | `POST /internal/ingest`、`POST /internal/remove`、`POST /internal/scrape-runs`（執行進度回報） | **HMAC 簽章加時間戳**，金鑰未設定時一律拒絕 |
| 管理 | `GET /v1/admin/overview`、`GET /v1/admin/welfare`、`GET/PATCH /v1/admin/welfare/:id`、`POST /v1/admin/welfare/:id/restructure`、`GET /v1/admin/llm-usage`、`GET /v1/admin/users`、`GET /v1/admin/users/:id`、`GET /v1/admin/audit`、`GET /v1/admin/scraper`、`GET /v1/admin/scraper/runs/:id`（[admin.md](admin.md) §4） | admin（登入、Email 已驗證、`role = 'admin'`） |
| 系統 | `GET /health`（資料庫、migration、背景工作心跳、LLM 暫停狀態）、`GET /openapi.json` | 公開 |

---

## 7. 權限模型

**預設拒絕**：所有路由都要登記在 `access.ts` 的 `ROUTE_ACCESS`，未登記的一律要求登入；路由普查測試會檢查有沒有漏登記。這是為了修正 v1 中好幾個端點忘了加 Guard 的問題，例如 `/upload` 和家庭相關端點。

| 存取等級 | 條件 |
|---|---|
| `public` | 不需登入 |
| `optional` | 不需登入；有登入時提供使用者（附上資格比對） |
| `user` | 需登入 |
| `admin` | 需登入、Email 已驗證且 `role = 'admin'`，否則 403（[admin.md](admin.md) §3） |
| `hmac` | 爬蟲：HMAC 簽章加時間戳 |
| `line` | LINE webhook 簽章（P4 實作前一律拒絕） |

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
- 年齡組：**年滿 65 歲即屬「65歲以上」**（v1 要到 66 歲才算，造成年滿 65 歲的第一年所有老人福利都被判為紅燈）。
- 身分白名單和相容規則（例如低收入戶也符合中低收入戶的條件）移到 `packages/shared`，前後端共用。
- 比對寫成純函式 `match(profile, requiredIdentities) → { light, score, reasons }`，放在 `packages/shared/src/matching.ts`，分支覆蓋率 100%。
- 家庭模式：一次撈出成員資料，在記憶體中比對，排序權重沿用 v1 的公式：本人分數 × 1000 + 家人最高分。

### 8.1.1 家庭

- 建立者成為管理者（`admin`）。管理者可以改名、刪除家庭、產生邀請碼、修改角色、移除成員；一般成員只能查看與退出。
- **只能透過邀請碼加入**（R9）：6 碼英數字（與 v1 介面相同；去掉 0/O、1/I/L，不分大小寫），一次性，3 天內有效。已是成員時回 409 且不消耗邀請碼；已使用或過期回 410；同一碼同時被兩人使用時只有一人成功（條件式更新）。
- 家庭**至少保留一位管理者**：最後一位管理者不能降級或退出（409），要先指定其他管理者；最後一位成員退出時刪除家庭。
- 上限：每人最多 10 個家庭，每個家庭最多 20 人。
- 成員資料回傳姓名、頭像、性別、特殊身分標籤、角色、加入時間（與 v1 個人設定頁相同，家人之間看得到彼此的標籤），**不回傳生日與 email**；家庭模式的比對結果只回傳家人的姓名、頭像與紅黃綠燈。
- 刪除帳號（`DELETE /v1/me`）：Email 註冊的帳號要輸入密碼（與 v1 相同），只用 LINE / Google 登入的帳號只需確認；自己是唯一管理者的家庭，由最早加入的成員接任管理者；只剩自己的家庭直接刪除；登入方式、session、收藏由外鍵一併刪除；上傳的頭像從 R2 刪除。重新上傳頭像時也會刪除舊的。

### 8.2 搜尋

- 先用 SQL 篩選：縣市、類別、身分重疊（`&&`）、關鍵字（pg_trgm 相似度）、`status = 'active'`。
- 只對當頁的資料做資格比對，不再像 v1 一樣把所有資料載入記憶體再分頁。
- 排序（全部在 SQL 完成）：置頂（`pinned_at`）優先 → 有身分限制的福利優先 → 登入時，身分與使用者可能符合的（`identities && 使用者可滿足的身分`，含相容規則）優先 → 發布日期新到舊。精確的紅黃綠燈只對當頁計算。
- 存取類型 `optional`：搜尋與詳情不需登入；有登入時才附上比對結果與收藏狀態。

### 8.3 LLM（`lib/llm`）

```ts
export interface LLM {
  readonly model: string   // 預設模型，寫進結構化結果
  generate<T>(o: { system: string; input: string; schema: z.ZodType<T>; model?: string; meta?: LLMCallMeta }): Promise<T>
  stream(o: { system: string; messages: Message[] }): AsyncIterable<string>
  embed(texts: string[], meta?: LLMCallMeta): Promise<number[][]>
}
// meta：用途（structure / embed / probe / chat）、福利 id、prompt 版本，寫進 llm_calls（§8.3.2）
```

- **實作**：`gemini.ts`（`@google/genai`），預設模型 `gemini-3.5-flash-lite`（依 §8.3.1 回測選定；`GEMINI_MODEL` 可覆寫），embedding 為 `gemini-embedding-001`。每次呼叫的用量寫入 `llm_calls`（§8.3.2）。錯誤轉成 `LLMError`，種類為 `quota`（402／429）、`timeout`、`provider`、`schema`。
- **結構化輸出**：用 `z.toJSONSchema()` 把 Zod schema 轉成 Gemini 的 `responseSchema`，回傳後再用 Zod 驗證；不合格就重試一次，帶上錯誤訊息。
- **Embedding**：用 Gemini 的 embedding 模型輸出 768 維（`gemini-embedding-001` 支援 `outputDimensionality`），正規化後存入 pgvector。
- **沒有金鑰時**（`GEMINI_API_KEY` 未設定或 `LLM_DRIVER=rules`）：改用關鍵字規則結構化（`features/welfare/structure.ts` 的 `RuleStructurer`），只依標題標身分、寧可少標；不做 embedding。資料可以先被搜尋到。設定金鑰後重新啟動，啟動時的 backfill 會把規則結構化的福利全部重新排入。正式環境目前用 Gemini（2026-11-23 起）。
- **身分欄位的語意**：`identities` 是「一定要具備」的身分，多個特殊身分視為全部都要；「A 或 B」不列、「低收入戶或中低收入戶」只列中低收入戶（`match()` 的相容規則會涵蓋）。這段寫在 prompt 裡，規則版也遵守。LLM 的身分判斷方式見 §8.3.1。
- **人工判定**：管理者在後台判為福利或非福利（`status_override`）後，結構化不再改變狀態（[admin.md](admin.md) §4.3）。

| 用途 | 時機 | 執行位置 |
|---|---|---|
| 福利結構化 | 爬蟲送來新增或更新的資料 | 背景工作（pg-boss） |
| Embedding | 結構化完成後 | 同一個背景工作 |
| 阿哞聊天（RAG） | 使用者發問 → 規則解析條件 → 自己的 Postgres 混合檢索與資格比對 → 一次 LLM 串流回答（§8.9） | api 程序（SSE） |

#### 8.3.1 結構化回測（評測集）

改 prompt、換模型、改 schema 或 `buildInput` 前後都要跑回測，結果不低於門檻才能部署。

- **評測集**：`apps/api/eval/structure-cases.json` 是 98 筆正式資料的快照（2026-11-23 依縣市比例分層抽樣，含長文與開放資料）。存的是 `buildInput` 的原始輸入，所以不受來源網站之後改版影響，`buildInput` 改了也測得到。`structure-labels.json` 是人工判定的正確答案（是否個人福利、必備身分、截止日；名稱與摘要不評），`note` 記錄判定理由。
- **判定原則**：身分只列「每個申請人都一定要具備」的；擇一的條件都不列；「中低收入老人生活津貼」的資格不等於中低收入戶；年齡門檻不正好對應一個年齡層（例如 60 歲、55 歲原住民）就不列；法規全文、表單彙編、申訴與通報管道、跨機關作業流程不算個人福利。
- **執行**：`pnpm --filter @mou-welfare/api eval:structure [模型]`（需要 `GEMINI_API_KEY`），走正式的 `LLMStructurer`，包括身分保險。一次約 0.25 美元（`gemini-3.5-flash-lite`）。低於門檻時以非 0 結束，並列出答錯的項目。
- **門檻**：個人福利召回率 ≥ 95%（真福利被判為否會從列表消失）、精確率 ≥ 90%；身分多標率 ≤ 3%（多標會讓符合的人看到紅燈，最嚴重）、少標率 ≤ 15%；截止日正確率 ≥ 95%。
- **身分的判斷方式**：LLM 不直接輸出 `identities`，而是輸出 `identityChecks`（候選身分、照抄的原文依據、`canApplyWithout`＝沒有這個身分是否也能申請）。程式只採用 `canApplyWithout` 為 false、而且依據句子含有該身分關鍵字的（`hasEvidence`，例如「中低收入老人生活津貼」不算中低收入戶的依據），再經 `sanitizeIdentities`。寧可少標：少標只是少一個綠燈，多標會讓符合的人看到紅燈。
- **調整紀錄**（`gemini-3.5-flash-lite`，2026-11-23）：

  | 版本 | 個人福利召回率／精確率 | 身分多標率／少標率 | 截止日 |
  |---|---|---|---|
  | 初版 prompt | 100%／94.7% | **19.7%**／0% | 100% |
  | 細化中低收入、身障、年齡規則 | 100%／95.9% | 8.5%／0% | 100% |
  | 改為 identityChecks（附依據、判斷可否替代） | 97.2%／98.6% | 7.2%／0% | 98.6% |
  | 加上依據關鍵字檢查（目前版本，跑兩次） | 98.6%／95.9%、97.2%／94.5% | **1.4%**／2.9%、**0%**／2.9% | 98.6% |

  目前已知的錯誤：「符合中低收入老人生活津貼規定」的依據沒有寫 65 歲，所以少標 65歲以上；法規彙編、申訴管道偶爾被判為福利；家暴相對人服務、重陽敬老金偶爾被判為非福利。
- **注意**：即使 temperature 為 0，同一個模型兩次的結果也會有少數不同，差距小時要多跑一次確認。正確答案以 `gemini-3.8-flash` 的輸出為底再人工修正，對該模型的分數會偏高。

#### 8.3.2 LLM 用量紀錄

每一次 Gemini API 呼叫（包括失敗、schema 不合格後的重試、額度探測）都寫一列到 `llm_calls`：

| 欄位 | 內容 |
|---|---|
| `purpose` | `structure`（結構化）、`embed`（embedding）、`probe`（額度探測）、`chat`（聊天的問題 embedding 與回答） |
| `program_id` | 處理的福利（不設外鍵，福利刪除後紀錄仍保留） |
| `model`、`prompt_version` | 實際使用的模型；prompt 版本是 `SYSTEM_PROMPT` 加上輸出 schema 的 sha256 前 12 碼（`PROMPT_VERSION`），改 prompt 就會變 |
| `attempt` | 同一次結構化中第幾次呼叫（schema 不合格會重試一次） |
| `input_tokens`、`output_tokens`、`thoughts_tokens`、`total_tokens` | Gemini 回報的 `usageMetadata`；失敗時為 null |
| `input_chars`、`latency_ms`、`ok`、`error_kind`、`error` | 輸入字數、耗時、是否成功與錯誤類型（`quota`、`timeout`、`provider`、`schema`） |
| `cost_usd` | 呼叫當下依 `lib/llm/pricing.ts` 估算的費用（不在價格表的模型為 null） |

福利本身另外記下目前結果的 `structured_model`、`structured_prompt_version`（規則結構化時為 null）。回測與比較腳本不寫入這張表。

查詢：

```bash
cd ~/apps/mou-welfare-v2/apps/api
./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/llm-usage.ts              # 最近 30 天依日期／用途／模型彙總、錯誤、各版本的福利筆數
./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/llm-usage.ts --days 7
./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/llm-usage.ts --program <福利 id>   # 單筆福利的每次呼叫
```

預估費用以官方價格計算，實際帳單以 AI Studio 為準（兩者有差距時更新 `pricing.ts`）。

### 8.4 背景工作

| 名稱 | 類型 | 內容 |
|---|---|---|
| `welfare-structure` | pg-boss 佇列 | 結構化、embedding、寫回資料庫；一次一筆；失敗重試 3 次（指數退避，30 秒起）。內容 hash 沒變就略過，所以重複執行是安全的；啟動時補送遺失的工作（backfill）。結構化期間內容又被更新時不寫回，由新的工作處理。額度不足時自動暫停與恢復，見 §8.4.1 |
| `notify` | pg-boss 佇列 | Email（Resend）、LINE push |
| `deadline-reminder` | pg-boss cron（每日） | 通知收藏的福利即將截止 |
| `expire` | pg-boss cron（每日） | 把超過截止日的福利標為 `expired` |
| `cleanup` | pg-boss cron（每週） | 清除過期的邀請碼、session、verification |
| 系統檢查 | 程序內計時器（每小時） | 爬蟲中斷與逾期、結構化錯誤增加 → 寄信，見 §8.4.2 |

`notify`、`deadline-reminder`、`expire`、`cleanup` 是 P4 預定，尚未實作。

#### 8.4.1 LLM 費用與額度的保護

**額度不足時自動暫停、自動恢復**（`jobs/llm-pause.ts`）：

- Gemini 回 402（預付額度用完）或 429（速率或花費限制，訊息含 `RESOURCE_EXHAUSTED`）時，錯誤歸類為 `LLMError` 的 `quota`。
- 第一次遇到就寫入 `llm_pause` 表並停止從佇列取工作（`offWork`），寄信給 `ALERT_EMAIL`（未設定時只記 log）。觸發的那筆照常交給 pg-boss 重試，其餘工作留在佇列。
- 暫停中每 10 分鐘送一個極小的請求探測（幾個 token，費用可以忽略）。成功就刪除 `llm_pause`、恢復取工作、執行 backfill 補排尚未完成的福利，再寄一封恢復通知。**儲值後不需要任何操作**。
- 暫停狀態存在資料庫：重啟或重新部署後仍維持暫停，並在啟動時立刻探測一次（所以儲值後重新部署會馬上恢復）。
- `/health` 的 `llm` 欄位顯示 `paused`、`pausedAt`、`reason`。暫停**不影響** `status`，部署的煙霧測試照常通過。
- 暫停期間失敗的福利保留原本的結果（規則版或上一次 LLM 的結果），`structure_error` 記下原因。

**推送與重啟不會全量重做**：

- 啟動時的 backfill 只挑三種福利：從沒結構化過的、內容 hash 變了的、LLM 模式下仍是規則版結果的。全量做過一次後，推送、重新部署都只會挑出 0 筆。
- 改 prompt 或換模型也**不會**自動重做（避免一次 commit 就花掉全量的費用）。要重做時手動執行，先看預估再加 `--yes`：

  ```bash
  cd ~/apps/mou-welfare-v2/apps/api
  ./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/restructure.ts            # 只顯示筆數與預估費用
  ./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/restructure.ts --yes      # 排入佇列
  ./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/restructure.ts --city 基隆市 --limit 20 --yes
  ```

  工作帶 `force: true`，內容沒變也會用 LLM 重做；規則模式下 `force` 無效，不會用規則覆蓋 LLM 的結果。重做前先跑 §8.3.1 的回測。
- **第一次全量**不需要這支腳本：把 `api.env` 的 `LLM_DRIVER=rules` 拿掉並重啟，backfill 會把規則版的福利全部排入（每次最多 1,000 筆，其餘在恢復或下次重啟時補排）。2026-11-23 就是這樣完成的：實際約 3.52 美元、37 分鐘（預估 4.3 美元）。
- 爬蟲的 hash 會去掉「下載 N 次」這類計數器，避免每次爬取都重做（docs/scraper.md §6.4）。
- 最後一道限制是 AI Studio 的用量上限（目前每月新台幣 300 元）。

#### 8.4.2 監控與通知

通知一律寄到 `ALERT_EMAIL`（目前 `cherites0610@gmail.com`；未設定時只記 log），以 `alert_state` 去重，同一個狀況不會一直寄。

| 檢查 | 位置 | 何時通知 |
|---|---|---|
| Gemini 額度不足 | `jobs/llm-pause.ts` | 暫停時、恢復時（§8.4.1） |
| 爬蟲有站點不正常 | `POST /internal/scrape-runs` | 一次執行結束時有站點不是正常（附各站狀況與前幾個錯誤）；全部正常不寄 |
| 爬蟲中斷 | `jobs/monitor.ts`（每小時） | 執行中超過 4 小時沒有回報（單站最久約 90 分鐘），改為 `interrupted` |
| 爬蟲排程逾期 | 同上 | 超過預定時間（上次開始＋間隔）一天還沒有新的執行；之後每 24 小時再寄一次，直到恢復 |
| 結構化錯誤增加 | 同上 | 有 `structure_error` 的福利數比上次通知時多 |
| API、前端、後台無法連線 | GitHub Actions `uptime.yml`（每 30 分鐘） | `/health` 連續 3 次不是 `ok`，或前端、後台打不開。由 GitHub 寄出 workflow 失敗通知（API 掛掉時主機上的檢查也會停，所以要從外部看） |

### 8.5 帳號信件與限流

- 註冊後寄出驗證信，**未驗證不能登入**；點擊連結後自動登入（Better Auth `emailVerification`）。
- 重設密碼信 1 小時內有效；重設後登出所有既有 session。對不存在的 email 回應完全相同、但不寄信（R14）。
- 信件為繁體中文 HTML 加純文字版本，使用者名稱一律跳脫（`apps/api/src/lib/mail/templates.ts`）。
- 寄件人：`哞福利 <noreply@mou-welfare.com>`（2026-11-22 已在 Resend 驗證網域）。未驗證的環境預設用 `onboarding@resend.dev`，此時**只能寄給 Resend 帳號本人**。系統通知（額度不足暫停與恢復）寄到 `ALERT_EMAIL`。
- 限流（R15，以 `CF-Connecting-IP` 計算）：登入、註冊每 IP 每分鐘 5 次；重設密碼、重寄驗證信每 IP 每 5 分鐘 3 次。目前存在記憶體（單一程序足夠），改為多程序時要換成資料庫儲存。

### 8.5.1 第三方登入（Google、LINE、LIFF）

由 Better Auth 內建的 `google`、`line` provider 處理（`apps/api/src/lib/auth.ts`），金鑰成對設定才會啟用；未設定時 `/sign-in/social` 回 404，前端顯示「即將開放」。

| 登入方式 | 正式環境狀態 |
|---|---|
| LINE（網頁） | ✅ 2026-11-23 啟用，手機實測登入、新帳號導到填寫個人資料正常 |
| LIFF（LINE 內開啟） | ✅ 2026-11-23 啟用，手機實測自動登入正常；2026-11-24 切換網域後 Endpoint 要改為 `https://mou-welfare.com/` |
| 設定密碼（第三方登入的帳號） | ✅ 2026-11-23 上線，手機實測收信設定密碼、用信箱和密碼登入正常 |
| Google | ⏳ 程式已完成，待建立 OAuth client 並設定金鑰（第 11 節） |

| 方式 | 流程 |
|---|---|
| Google、LINE（網頁） | 前端 `signIn.social` → 轉到 Google / LINE → 回到 API 的 `/v1/auth/callback/{google,line}`（在 API 網域設 session cookie）→ 轉回前端 `/oauth-callback`。失敗時轉回 `/login?error=`（綁定時回 `/profile?error=`） |
| LIFF（LINE 內開啟） | `plugins/liff.client.ts`：只在 LINE 的瀏覽器且 `liff.isInClient()` 時載入 SDK，取 `liff.getIDToken()` 呼叫 `/sign-in/social`（`idToken`）。API 向 LINE 的 `/verify` 驗證，`aud` 必須是 `LINE_CHANNEL_ID`。ID Token 過期時登出 LIFF 重新登入一次 |

- **登入後去哪裡**：`/oauth-callback` 讀 `/v1/me`，生日、性別、縣市都沒填過就導到「填寫個人資料」（預先帶入 LINE / Google 的名稱與頭像），否則回到原頁面（`redirect` 只接受站內路徑）。
- **合併既有帳號**：第三方的 email 和既有帳號相同時自動合併，但兩邊的 email 都必須已驗證（Better Auth 的 `requireLocalEmailVerified`）。避免有人先用別人的 email 註冊、等對方用 Google 登入時被合併。Google 依 `email_verified`；LINE 回傳的 email 視為已驗證（LINE 登錄 email 時需要驗證碼）。不符合時回 `account_not_linked`，前端提示「先用原本的方式登入，再到個人設定綁定」。
- **主動綁定**：個人設定的「帳號管理」可以綁定或解除 Google / LINE（`linkSocial`，允許 email 不同）；Better Auth 不允許解除最後一種登入方式。
- **設定密碼**：只用 LINE / Google 登入的帳號，可以在個人設定按「設定密碼」，寄信到自己的信箱，沿用重設密碼的流程（Better Auth 重設時若沒有密碼會建立一組；信件主旨與頁面文字改為「設定」）。要能收信才能設定，避免 session 被盜時直接被設定密碼。替代地址的帳號不顯示這個選項。
- **LINE 沒有 email**（channel 沒申請 email 權限，或使用者沒登錄 email）：改用 `<LINE user ID>@line.invalid`（RFC 2606 保留網域），不寄任何信，畫面上不顯示。
- `callbackURL` 必須在 `TRUSTED_ORIGINS` 內（Better Auth 在測試環境預設不檢查，`advanced.disableOriginCheck: false` 讓測試也檢查）。`/sign-in/social` 每 IP 每分鐘 10 次。
- **需要的設定**：

| 項目 | 值 |
|---|---|
| Google OAuth client（網頁應用程式） | 已授權的重新導向 URI：`https://api.mou-welfare.com/v1/auth/callback/google`（本機開發 `http://localhost:5031/v1/auth/callback/google`） |
| LINE Login channel | Callback URL：`https://api.mou-welfare.com/v1/auth/callback/line`（2026-11-24 起；`api-v2` 那條要刪除）；OpenID Connect 申請 email 權限 |
| LIFF app（掛在同一個 LINE Login channel） | Endpoint URL：`https://mou-welfare.com/`；scope `openid`、`profile`、`email` |
| API（`api.env`） | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET` |
| 前端（`apps/web/wrangler.jsonc` 的 `vars`） | `NUXT_PUBLIC_LIFF_ID`（公開值） |

### 8.6 圖片上傳

- 以 sharp 處理：依 EXIF 轉正 → 512×512 裁切（依顯著區域） → WebP 品質 80 → 移除全部中繼資料（含 GPS）。
- 以實際內容判斷格式，不相信 Content-Type 與副檔名；拒絕 SVG（可能含腳本）；`limitInputPixels` 防止解壓縮炸彈。
- 儲存路徑 `avatars/{userId}/{uuid}.webp`，上傳後更新 `user.image`。

### 8.7 LINE Bot

LINE 官方帳號（`@417ahfau`）的對話（`features/line/`）。✅ 2026-11-24 上線：Webhook 設定完成，手機實測已登入與未登入的回覆、福利卡片、追問都正常。和網站的聊天共用同一個聊天服務（§8.9），不串流：收齊回答後一次回覆。

| 步驟 | 做法 |
|---|---|
| webhook | `POST /v1/line/webhook`。`access.ts` 以 channel secret 驗證 `x-line-signature`（原始 body 的 HMAC-SHA256），沒有設定 secret 時一律 401（R11）。通過後把每個事件排入 pg-boss 的 `line-event`，立即回 200；沒有事件的請求（LINE 驗證 webhook 網址時）也回 200 |
| 佇列 | `line-event` 不重試（重試會重複扣次數、重複回覆）；LINE 重送同一個事件時以 `webhookEventId` 當 `singletonKey` 去重。背景工作同時處理 4 則（大多時間在等 LLM） |
| 誰在問 | Messaging API 的使用者 ID 和 LINE Login 的相同（**兩個 channel 必須在同一個 provider**），所以 `account` 表有 `provider_id = 'line'`、`account_id = 使用者 ID` 的就是用 LINE 登入過的人 |
| 已登入的人 | 交給 `sendMessage`：套用個人資料（燈號、居住縣市）、和網站共用每日 30 則、對話存成 `chat_sessions.channel = 'line'`（網站的歷史對話也看得到）。隔 30 分鐘沒說話就開新對話，否則追問沿用上一輪的條件 |
| 還沒登入的人 | 不呼叫 LLM、不寫入對話：用規則解析與關鍵字檢索列出福利，附上 LIFF 登入按鈕（`https://liff.line.me/{LINE_LIFF_ID}`）。在 LINE 裡用 LIFF 登入後，下一則訊息就會認得 |
| 回覆格式 | 文字：Markdown 轉成純文字，`[[福利 id]]` 換成卡片編號 `[n]`，上限 4,900 字。福利卡片：Flex carousel（名稱、縣市、截止日、燈號、摘要、「查看詳情」連到 `WEB_BASE_URL/welfares/:id`），最多 6 張 |
| 送出 | 先送「輸入中」動畫，回答好後用 reply token 回覆；reply token 過期（LLM 回答久一點時）改用 push |
| 其他事件 | 加入好友：打招呼，還沒登入的附登入按鈕。貼圖、圖片：請使用者改用文字。群組與聊天室不回覆（不知道是誰在問，也不該把個人的資格比對貼到群組）；standby 模式不回覆 |

**設定**：`api.env` 的 `LINE_BOT_CHANNEL_SECRET`、`LINE_BOT_ACCESS_TOKEN`（Messaging API channel 的長期 channel access token）成對設定才啟用；`LINE_LIFF_ID`（公開值）、`WEB_BASE_URL`（預設 `https://mou-welfare.com`）。LINE Official Account Manager 關閉「自動回應訊息」，Messaging API 的 Webhook URL 設為 `https://api.mou-welfare.com/v1/line/webhook` 並開啟「Use webhook」。

**測試**：`tests/line.test.ts`（簽章與佇列、已登入與未登入、次數用完、追問與開新對話、reply 過期改用 push、加入好友、非文字、群組與 standby、文字轉換），FakeLineBot 與 FakeLLM，不連 LINE 與 Gemini。

---

### 8.8 管理後台

獨立的前端 `apps/admin`（`admin.mou-welfare.com`）加上 API `/v1/admin/*`：總覽、福利檢核（人工判定不被結構化覆蓋）、LLM 用量、使用者（唯讀，查看詳情寫入稽核紀錄）、稽核紀錄。架構、權限、操作與部署都寫在 **[admin.md](admin.md)**。

### 8.9 聊天（阿哞）

> 狀態：2026-11-23 完成（API、前端、檢索評測集）；LINE Bot 共用聊天服務尚未做（§8.7）。原則：**只有「產生文字」交給外部 LLM**；理解問題、檢索、對話紀錄都在自己這邊，LLM 不可用時聊天仍能列出符合的福利。

**與 v1 的差別**：v1 每則訊息呼叫兩次 LLM（NLU 判斷意圖、產生回答），檢索交給 Google Vertex AI Search（福利資料另外同步到 Google、要服務帳號金鑰），沒有串流；任一服務出問題聊天就整個不能用。

| 環節 | v2 做法（`apps/api/src/features/chat/`） | 外部依賴 |
|---|---|---|
| 理解問題 | **規則解析**（`parse.ts`，不用 LLM）：縣市（22 縣市、去掉「市／縣」的簡稱、臺／台、雙北、馬祖；只說新竹、嘉義時市與縣都算）、身分（低收、中低收、身障、原民、外配、長者、懷孕等口語）、年齡（「70 歲」）、類別。另有一小份同義詞表把口語加上公告常用的寫法（身障→身心障礙、租屋→房屋租金、輪椅→輔具、單親→特殊境遇家庭……），只加進關鍵字 | 無 |
| 條件合併 | 縣市：提到就換，沒提到沿用上一輪，第一輪用個人資料的居住縣市。**追問**（去掉縣市、身分、語助詞後沒有實質內容，例如「那臺北呢」「那低收入戶呢」）沿用上一輪的主題並合併身分，檢索文字是「主題＋追問」；其他情況視為新問題。條件存在 `chat_sessions.filters` | 無 |
| 檢索 | **一條 SQL**（`retrieve.ts`）：`status = 'active'`、縣市篩選 → 分數 = 0.7 × 語意（pgvector cosine，問題用 `RETRIEVAL_QUERY` 的 embedding）＋ 0.3 × 關鍵字，再加權（福利要求的身分與問題提到的重疊 +0.05、類別相符 +0.03、使用者或家人可能符合 +0.03）→ 取前 20 筆做資格比對 → 綠燈 +0.04、黃燈 +0.02 → 取前 6 筆，分數低於第一名 60% 的不列 | 問題的 embedding 呼叫 Gemini（費用可忽略）；失敗、沒有金鑰或額度暫停時只用關鍵字 |
| 關鍵字分數 | **不用 pg_trgm**：它把整句中文當成一個詞（「育兒津貼」對「臺北市育兒津貼補助」只有 0.4）。改成問題關鍵字的**二字詞**有幾成出現在名稱（權重 1）與摘要（權重 0.5） | 無 |
| 縣市沒有資料 | 篩選的縣市完全沒有福利（還沒收錄）時改列其他縣市的，並在 prompt 要求先說明 | 無 |
| 對話紀錄 | `chat_sessions`、`chat_messages`，不使用供應商的 thread 功能；最近 6 則（拿掉引用）帶進 prompt | 無 |
| 產生回答 | **一次 LLM 串流呼叫**（`lib/llm` 的 `stream()`，temperature 0.3）。prompt 裡的福利以 1–6 編號，LLM 以 `[[編號]]` 標註；伺服器串流時換成 `[[福利 id]]`，不在清單內的編號直接移除（`CitationRewriter`，標註被切在兩個 chunk 之間也能處理） | Gemini（換供應商只改一個實作檔） |
| LLM 不可用 | 沒有金鑰（規則模式）、額度暫停中（`llm_pause` 有資料，§8.4.1）、串流逾時或錯誤時**退回固定格式**：「AI 暫時無法回覆，以下是依你的條件找到的福利」加上福利清單與福利卡，`metadata.mode = 'fallback'`、`metadata.error` 記下原因。沒有找到任何福利時不呼叫 LLM | 無 |

**API**（全部需要登入；別人的對話一律 404，R7）：

| 端點 | 說明 |
|---|---|
| `GET /v1/chat/sessions` | 最近 50 個對話，`meta.quota` 為今日已用與上限 |
| `POST /v1/chat/sessions` | 開新對話（前端在送出第一則時才建立） |
| `GET /v1/chat/sessions/:id` | 對話與訊息（助理訊息附 `sources`、`mode`） |
| `DELETE /v1/chat/sessions/:id` | 刪除對話（不會讓今日次數歸零） |
| `POST /v1/chat/sessions/:id/messages` | `{ content（1–500 字）, familyId?, useProfile（預設 true） }`，回 SSE |

**一則訊息的流程**：

1. 擁有者（404）、家庭成員（403）、每日次數（429）在開始串流前檢查，回一般的 HTTP 狀態碼。次數以條件式 upsert 原子地加一（`chat_usage`），同時送出也不會超過。
2. 規則解析條件，與個人資料、上一輪條件合併，存回 `chat_sessions.filters`。
3. 檢索並做資格比對（`useProfile = false` 時不比對、也不用居住縣市；`familyId` 附上家人的燈號）。
4. SSE 依序送出：`sources`（福利卡與燈號，不等 LLM）→ `delta`（逐段文字）→ `done`（訊息 id、模式、**完整內容**：前端以它取代逐段文字，所以串流到一半失敗改成固定格式也正確）。非預期的錯誤送 `error`。回應加 `cache-control: no-transform`、`x-accel-buffering: no`。
5. 存下使用者與助理的訊息；用量寫入 `llm_calls`（`purpose = 'chat'`：問題的 embedding 與回答各一列，串流的用量取最後一個 chunk 的 `usageMetadata`；管理後台的 LLM 用量頁自動顯示）。

**Prompt 的內容**（`prompt.ts`）：系統規則（只根據提供的福利回答、第一次提到時標註編號、考慮燈號且不保證符合、無關時說沒找到、只談福利、300 字內不用表格、不索取個資）、今天日期、條件（縣市、問題提到的身分、使用者的年齡層／性別／身分、家人的年齡層與身分）、6 筆福利（名稱、縣市、摘要、資格、補助內容、截止日、對使用者與家人的燈號）、最近 6 則對話。

**決定事項**（2026-11-23）：

- **必須登入**（控制費用與濫用，也才能用個人資料比對資格）。
- **每人每日 30 則**（臺北時間計算），超過時回 429 並提示明天再來。
- **LLM 不可用時退回列出福利**，不顯示「暫停服務」。

**個資**：送到 LLM 的只有問題、公開的福利內容、粗略條件（年齡層、性別、縣市、身分標籤）；不送姓名、email、生日，家人以「家人 1、2」表示，也只送年齡層與身分（`tests/chat.test.ts` 檢查 prompt 不含姓名、email、生日）。

**費用**：每則約 0.002 美元（輸入約 4,000 tokens、輸出約 400 tokens，`gemini-3.5-flash-lite`）；一天 1,000 則約 2 美元。上限 30 則／人／日。

**自己跑模型**：主機 2 核、1.9 GB 記憶體（可用約 700 MB），對話模型不可行。embedding 可以換成本機小模型（例如 multilingual-e5-small 量化版約 120 MB），但要把全部福利重算、記憶體也緊；先用 Gemini 加關鍵字備援，之後要拿掉這個依賴時只改 `embed()` 的實作。

**前端**（`apps/web`）：`components/ChatBoard.vue` 照 v1 的 ChatBoard 重做；手機是 `/chat` 全頁（底部導航「阿哞」），桌機在福利列表點右下的阿哞開浮動視窗。送訊息用 `fetch` 讀串流（EventSource 只能 GET），`composables/useChat.ts` 解析 SSE。回答裡的引用顯示成編號小標，對應下方福利卡的編號，點擊站內換頁；福利卡顯示燈號、縣市、家人的燈號。輸入區有新對話、歷史對話、家庭模式、「套用個人資料」開關，標題列顯示今天還可以問幾則。

**品質**：

- **檢索評測集**：`apps/api/eval/chat-cases.json` 有 42 個真實問法（含 2 個追問），各標出應找到的福利（以 `program_key` 標註）。`pnpm --filter @mou-welfare/api eval:chat [--keyword-only] [--verbose]` 對資料庫唯讀執行（要 `DATABASE_URL`；語意模式另要 `GEMINI_API_KEY`），量前 6 筆至少命中一筆的比例。門檻：語意＋關鍵字 ≥ 90%、只用關鍵字 ≥ 75%；低於門檻以非 0 結束。正確答案下架時會列出，要更新評測集。
- **結果**（2026-11-23，正式資料）：語意＋關鍵字 97.6% → 加入同義詞後 **100%**（平均召回率 97.2%）；只用關鍵字 88.1% → **100%**（93.7%）。**注意**：同義詞是看了沒命中的題目後才加的，對這份評測集會偏樂觀；之後要從實際的提問（`chat_messages`）抽新的問法加進評測集。
- 規則解析、關鍵字、引用改寫、prompt 用表格測（`tests/chat-parse.test.ts`）；流程用 FakeLLM 測（`tests/chat.test.ts`）：SSE 順序、引用改寫與過濾、追問、套用個人資料、家庭模式、縣市沒有資料、三種退回固定格式、沒有結果不呼叫 LLM、次數限制（含同時送出）、擁有者與家庭成員檢查、prompt 不含個資。
- 回答品質抽樣人工檢查。

**實作順序**：

1. ✅ 規則解析與混合檢索，加檢索評測集。
2. ✅ 資料表與聊天 API（SSE、次數限制、退回固定格式）。
3. ✅ 驗證 SSE 經過 Cloudflare 與 Caddy 不被緩衝（§11 P0；2026-11-24 在正式環境登入後實測，文字逐段出現）。
4. ✅ 前端照 v1 的 ChatBoard 重做（手機 `/chat`、桌機右下浮動視窗）。
5. ✅ LINE Bot 共用同一個聊天服務（不串流，收齊後回覆並附福利 Flex 卡片，§8.7；2026-11-24）。

## 9. 資料庫基礎設施（已完成）

2026-11-18 在 `postgres.cherites.org`（騰訊雲東京，2 vCPU、1.9 GB RAM）完成以下設定：

| 項目 | 狀態 |
|---|---|
| Postgres 版本 | 16.11，SSL 已開啟 |
| pgvector | ✅ 已安裝 0.6.0（Ubuntu 套件 `postgresql-16-pgvector`，支援 HNSW） |
| 資料庫 | ✅ `mou_welfare`（UTF8、`C.UTF-8`），擁有者為 `mou_welfare` |
| 擴充 | ✅ `vector 0.6.0`、`pg_trgm 1.6`、`pgcrypto 1.3` |
| 帳號 | ✅ `mou_welfare`（LOGIN，非 superuser、沒有 CREATEROLE，連線上限 30），只有自己的資料庫有 CONNECT 權限 |
| 連線字串 | 存在主機上的 `~/.config/mou-welfare/db.env`（權限 600）和 `~/.pgpass`，**不進版控** |
| 每日備份 | ✅ `~/.local/bin/mou-welfare-backup.sh`，crontab 每天 03:17（主機時區 UTC+8）執行；`pg_dump -Fc` 存到 `~/backups/mou-welfare/`，保留 30 天；日誌在 `~/.local/state/mou-welfare-backup.log` |
| R2 異地備份 | ✅ bucket `mou-welfare-backups`，lifecycle 規則 `expire-daily-30d`（`daily/` 前綴 30 天後刪除）；2026-11-18 測試上傳並下載比對，內容一致 |
| 連線 | ✅ 2026-11-24 起**只聽本機**（`listen_addresses = 'localhost'`），API、背景工作、備份都在同一台主機。v1 的資料庫 `mou-welfare` 同日刪除 |

**2026-11-24 強化**（修改前的設定為 `/etc/postgresql/16/main/*.bak-202611241400`）

起因：5432 對所有網路開放，`pg_hba` 允許任何 IP、任何帳號用密碼連任何資料庫；日誌顯示 9 月以來有 23,242 次猜密碼（`postgres`、`root`、`admin` 等常見帳號，沒有針對 `cherites`、`mou_welfare`），而 `cherites` 是有密碼的 superuser。

| 項目 | 改成 |
|---|---|
| `listen_addresses` | `'localhost'`（只聽 127.0.0.1） |
| `pg_hba.conf` | 白名單：`postgres`、`cherites` 只能在主機上以同名系統帳號登入（peer）；`mou_welfare` 只能從本機以密碼（scram-sha-256）連 `mou_welfare`、`mou_welfare_dev`、`mou_welfare_test`；其他一律 `reject`。移除複寫規則（沒有使用） |
| `cherites`（superuser） | 移除密碼，只能 peer 登入 |
| `mou_welfare` | 移除 CREATEROLE |
| `pet-erp`（舊專案，保留不動） | 移除 PUBLIC 的 CONNECT／TEMPORARY；只有 superuser 能連。11/17 起沒有任何程式使用（API 在 11/17 的主機整理時從 pm2 移除），只有兩個測試租戶共 168 筆資料 |
| 驗證 | v2 API、背景工作（重啟後自動重連）、每日備份正常；`cherites` 走 TCP、`mou_welfare` 連 `pet-erp` 都被拒絕；從主機的公開 IP 連 5432 回 Connection refused |

- 雲端防火牆：騰訊雲安全群組的 5432 規則也應移除（多一層保護）。主機的 ufw 不啟用：設錯會鎖住 SSH，而資料庫已經只聽本機。
- 之後要讓其他主機連資料庫時，用 Tailscale：`listen_addresses` 加上 Tailscale 的位址，`pg_hba` 只允許 `100.64.0.0/10` 與指定的帳號、資料庫。

---

## 10. 部署

### 10.1 API（自有主機）

| 項目 | 做法 |
|---|---|
| 程式位置 | `~/apps/mou-welfare-v2/`（部署用的 checkout，**和開發用的 `~/Project/mou-welfare` 分開**，避免再次影響正式環境） |
| 程序 | pm2：`mou-welfare-v2-api`（port 5030，只聽 127.0.0.1），背景工作在同一程序內（`WORKER_MODE=inline`）；設定寫在 `ecosystem.config.cjs`，`pm2 save` 確保開機會自動啟動 |
| HTTPS | Caddy：`api.mou-welfare.com { reverse_proxy 127.0.0.1:5030 { flush_interval -1 } }` |
| 環境變數 | `~/.config/mou-welfare/api.env`（權限 600，不進版控）：`DATABASE_URL`、`BETTER_AUTH_SECRET`、`GOOGLE_*`、`LINE_*`、`GEMINI_API_KEY`、`INGEST_HMAC_KEY`；寄信 `MAIL_DRIVER=resend`、`RESEND_API_KEY`、`EMAIL_FROM`（已設定）；系統通知收件人 `ALERT_EMAIL`（額度不足、爬蟲異常、結構化錯誤等，§8.4.2；已設定）；上傳 `STORAGE_DRIVER=r2`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_PUBLIC_BASE_URL`（已設定：bucket `mou-welfare-uploads`，公開網址 `https://file.mou-welfare.com`，專用 R2 token）；`GEMINI_API_KEY`（已設定；2026-11-23 起已移除 `LLM_DRIVER=rules`，用 Gemini 結構化）；`TRUSTED_ORIGINS=https://mou-welfare.com,https://admin.mou-welfare.com`（CORS 與 Better Auth 共用）。完整定義見 `apps/api/src/env.ts` |
| 資料庫連線 | `postgresql://mou_welfare@localhost:5432/mou_welfare` |
| Migration | 部署腳本中執行 `drizzle-kit migrate`，成功後才重啟程序 |
| 部署流程 | 在主機上執行 `~/apps/mou-welfare-v2/ops/deploy-api.sh`：拉取 `origin/main` → `pnpm install --frozen-lockfile` → build → migration → `pm2 reload`（不中斷服務）→ 煙霧測試（`/health` 為 ok、`/v1/faq` 可回應）；**失敗時自動退回上一版**。migration 不會自動回復，因此必須維持向前相容。GitHub Actions（`deploy.yml`）在 CI 通過後透過 SSH 傳入 commit SHA 觸發：authorized_keys 以 `command="…/deploy-api.sh --from-ssh"` 限定這把金鑰只能執行部署，`--from-ssh` 模式只接受完整的 40 碼 SHA（其他內容、包括空白一律拒絕）。設定見 `docs/deploy-setup.md` |
| 日誌 | pm2 日誌加上 pm2-logrotate（主機上已安裝） |
| 監控 | 外部定時檢查 `/health`（例如 UptimeRobot 或 Cloudflare Health Checks）；錯誤追蹤可選 Sentry |

**目前狀態（2026-11-23）**

| 項目 | 狀態 |
|---|---|
| 部署目錄 | ✅ `~/apps/mou-welfare-v2`（獨立的 git clone），目前為 `main` 最新版 |
| 資料庫 | ✅ 正式資料庫 `mou_welfare` 已套用 12 個 migration（`0000_init`、`0001_welfare`；`0002_ingest`：`welfare_sources`、`ingest_log`、福利狀態 `pending` / `rejected`；`0003_family`：家庭、成員、邀請碼；`0004_subscribed`：`user.is_subscribed`；`0005_pinned`：`welfare_programs.pinned_at`；`0006_llm_pause`：額度不足的暫停狀態；`0007_llm_calls`：LLM 用量紀錄與 `structured_model`、`structured_prompt_version`；`0008_admin`：人工判定欄位、`admin_audit`；`0009_scraper_runs`：`scrape_runs`、`alert_state`；`0010_chat`：`chat_sessions`、`chat_messages`、`chat_usage`；`0011_line`：`chat_sessions.channel`） |
| pm2 | ✅ `mou-welfare-v2-api` 運作中（約 120 MB），已 `pm2 save` |
| Caddy | ✅ `api.mou-welfare.com` → `127.0.0.1:5030`（`flush_interval -1`），修改前的設定備份在 `/etc/caddy/Caddyfile.bak-*`（切換前為 `Caddyfile.bak-202611241039`） |
| DNS | ✅ `api.mou-welfare.com` A 紀錄 → `43.130.226.136`（Proxied）；`mou-welfare.com`、`admin.mou-welfare.com` 是 Workers 自訂網域 |
| 自動部署 | ✅ 2026-11-22 設定完成：CI 通過後部署 API（SSH）、前端與管理後台（Workers），再做正式環境煙霧測試（API `/health`、前台 `/login`、後台 `/login`）；最近一次成功為 `68b79fd`（2026-11-23） |
| 範例資料 | 前端開發用 7 筆範例福利（`apps/api/scripts/seed-mock-welfare.ts`）：欄位照 LLM 結構化格式手寫，名稱加「【範例】」、`program_key` 以 `mock:` 開頭、全部置頂。寫入：`pnpm --filter @mou-welfare/api exec tsx --env-file=.env scripts/seed-mock-welfare.ts`；刪除加 `--remove`。2026-11-23 曾寫入正式資料庫供檢視前端，**同日已刪除**（`removed 7 mock programs`）；之後只在本機開發資料庫使用 |
| 福利資料 | ✅ 2026-11-22 共 13 個來源、**12 縣市、1,471 筆福利**（第一批：金門、新北、基隆、臺中開放資料 463 筆；第二批：臺北、桃園、臺南、嘉義市、屏東、宜蘭、花蓮、彰化、桃園開放資料 1,008 筆），見 `docs/scraper.md` §10.3 |
| 結構化 | ✅ 2026-11-23 全部 1,471 筆以 Gemini（`gemini-3.5-flash-lite`、prompt `3ff526b52226`）完成結構化與 embedding：active 985、rejected 455、expired 31。共 1,476 次結構化呼叫（3 次 schema 重試、2 筆因重試做了兩次）、輸入 8.04M／輸出 0.44M tokens、約 3.52 美元，實際處理約 37 分鐘。中途預付額度用完一次，**自動暫停與恢復皆已在正式環境驗證**（§8.4.1）。被判為非個人福利的比例：屏東縣 63%、新北市 45%、花蓮縣 38%，待在管理後台人工檢核（[admin.md](admin.md) §4.3） |
| 管理後台 | ✅ 2026-11-23 上線 `admin.mou-welfare.com`，管理者 cherites0610@gmail.com（[admin.md](admin.md)） |
| 爬蟲排程 | ✅ 2026-11-23 起每 3 天執行一次（crontab 每天 02:23 觸發 `ops/scrape-scheduled.sh`），進度回報到管理後台的「爬蟲」頁，見 `docs/scraper.md` §10.4 |

**事故紀錄**

- **2026-11-22 重複的結構化工作**：每次重啟時 backfill 都把所有尚未結構化的福利重新排入，多次重啟後累積約 2,200 個重複工作。重複執行本身是安全的（hash 沒變就略過），但在 Gemini 模式下會重複呼叫 API。已修正為略過已在佇列中的福利（`be05feb`）。
- **2026-11-22 改回規則時覆蓋了 LLM 的結果**：結構化只比對「方式是否相同」，從 gemini 改回 rules 時，LLM 已完成的結果會被規則版本覆蓋。已修正為內容沒變時不覆蓋 LLM 的結果。

### 10.2 前端（Cloudflare）

| 項目 | 做法 |
|---|---|
| 部署 | `pnpm --filter @mou-welfare/web build && pnpm --filter @mou-welfare/web run deploy`（要加 `run`：pnpm 有同名的內建指令 `deploy`；`apps/web/wrangler.jsonc`，Worker 名稱 `mou-welfare-web`）。GitHub Actions（`deploy.yml`）在 CI 通過後自動部署，設定見 `docs/deploy-setup.md` |
| 呼叫 API | 環境變數 `NUXT_PUBLIC_API_BASE`（`https://api.mou-welfare.com`）。瀏覽器以 `credentials: 'include'` 呼叫，API 以 CORS 只允許 `TRUSTED_ORIGINS` 帶 cookie。session cookie 屬於 API 網域，所以登入相關與個人頁面設為只在瀏覽器渲染（`routeRules` 的 `ssr: false`）；公開頁面（福利列表、詳情）維持 SSR |
| 網域 | `mou-welfare.com`（Workers 自訂網域，2026-11-24 起） |
| 目前狀態 | ✅ 2026-11-19 部署，2026-11-22 起由 GitHub Actions 自動部署，外部檢查各頁 200、`/welfares` 為 SSR；瀏覽器實測跨網域呼叫 API 正常。API 的 `TRUSTED_ORIGINS` 為 `https://mou-welfare.com,https://admin.mou-welfare.com` |
| 管理後台 | `apps/admin`，Worker `mou-welfare-admin`，網域 `admin.mou-welfare.com`；部署方式見 [admin.md](admin.md) §8 |
| 已完成頁面 | 登入註冊流程；2026-11-23 依 v1 介面完成：福利列表 `/welfares`（搜尋、地區／服務／家庭篩選、自動篩選、進階篩選、無限捲動；第一頁 SSR）、福利詳情 `/welfares/:id`（資格分析、AI 摘要、申請條件、補助內容、附件、原文；SSR 含 JSON-LD；網址加 `?review=1` 顯示資料檢核）、個人設定 `/profile`（家庭管理、邀請 QR Code、帳號管理：綁定與解除 LINE / Google、設定密碼、刪除帳號）、第三方登入落地頁 `/oauth-callback`（LINE 登入與 LIFF 自動登入見 §8.5.1）、編輯個人資料 `/profile/edit`、收藏 `/favorites`、常見問題 `/question`（SSR，含 FAQPage JSON-LD）、服務條款 `/terms`、隱私權政策 `/private` |

### 10.3 從 v1 切換到 v2（2026-11-24 完成）

不搬移 v1 的資料（使用者、家庭、收藏），v1 的使用者在 v2 重新註冊。

1. ✅ 在 LINE Login channel 加入新的 Callback URL `https://api.mou-welfare.com/v1/auth/callback/line`（先加，`BETTER_AUTH_URL` 一改就會用到）。
2. ✅ 刪除 Cloudflare DNS 裡 `mou-welfare.com` 指向主機的紀錄（Workers 自訂網域需要），推送 `6728f03`：Workers 加上 `mou-welfare.com`，前端改呼叫 `api.mou-welfare.com`，`/family` 轉到 `/profile`，煙霧測試與外部監控改用新網域。從刪除 DNS 到部署完成期間網站無法連線（推送後約 6 分鐘完成）。
3. ✅ Caddy：移除 v1 的 `mou-welfare.com`（靜態檔）與 `api.mou-welfare.com`（port 5009），`api.mou-welfare.com` 改代理到 5030，`api-v2` 保留。`api.env` 的 `BETTER_AUTH_URL`、`scraper.env` 的 `API_BASE` 改為 `https://api.mou-welfare.com`（修改前的檔案為 `*.bak-cutover`）。
4. ✅ 移除 v1：pm2 刪除 `mou-welfare-api` 並 `pm2 save`；停用 Redis（只有 v1 在用）；刪除 worktree `~/Project/mou-welfare-v1`、`~/Project/mou-welfare-v1-web`（程式在 git tag `v1-api`、`v1-web`）。
5. ✅ 同日移除：v1 的資料庫 `mou-welfare`、v1 的本機檔案（`~/Project/mou-welfare-v1-local`）；舊網域 `v2.mou-welfare.com`（Workers 設定）、`api-v2.mou-welfare.com`（Caddy）、`TRUSTED_ORIGINS` 裡的 `v2.mou-welfare.com`。
6. 待處理（Cloudflare、LINE、GCP 後台）：刪除 DNS 紀錄 `api-v2.mou-welfare.com`、`mou-welfare.cherites.org`、`api.mou-welfare.cherites.org`，以及 Workers 上的自訂網域 `v2.mou-welfare.com`；LINE Login 刪除 `api-v2` 的 Callback URL；LIFF Endpoint 改為 `https://mou-welfare.com/`；Messaging API webhook 關閉或改成自動回覆（v1 的 LINE Bot 已停，v2 的在 P4）；GCP 刪除 v1 的 Vertex AI Search 並停用服務帳號金鑰；重新發行 v1 用過的 LINE Messaging token。

**影響**：已登入 v2 的人要重新登入一次（session cookie 屬於 API 網域）。v1 的福利網址（`/welfares/{v1 的 id}`）在 v2 找不到。

### 10.4 v1（已移除）

v1 的 API（NestJS，pm2 `mou-welfare-api`，port 5009）與前端（Vue，Caddy 靜態檔）2026-11-24 停用並移除，程式保留在 git tag `v1-api`、`v1-web`，文件在 `docs/v1/`。v1 的資料庫同日刪除。

**預估月費**：前端與管理後台用 Cloudflare Workers（先用免費方案，SSR 若超出 CPU 限制再升級 Paid，每月 5 美元）；R2 在免費額度內；主機為現有資源；Gemini 依用量計費（預付制；額度用完時結構化自動暫停，儲值後自動恢復，§8.4.1；AI Studio 用量上限每月新台幣 300 元）。

**Gemini 用量估算**（2026-11-23 以正式資料 30 筆實測；同日全量 1,471 筆實際花費約 3.52 美元）：每筆福利結構化一次（輸入上限 16,000 字，含附件文字；中文約 0.84 token／字，平均約 6,200 tokens）加一次 embedding。`gemini-3.5-flash-lite`（$0.30／$2.50 每百萬 tokens，不思考；目前預設，依回測選定）每筆約 1.3 秒、0.0024 美元（加上 identityChecks 後輸出略增），目前 1,471 筆全量約 3.5–4 美元、40 分鐘；`gemini-3.8-flash` 約 10 美元、每筆 5–11 秒。embedding 全量約 0.07 美元。之後只有爬蟲判定內容變動的才會重做，日常每天個位數到數十筆，每月不到 1–2 美元。換模型或改 prompt 時才需要全量重做。注意：`gemini-2.5-flash` 已停用，2026-12-01 起自動改送 `gemini-3.5-flash-lite`；`gemini-2.5-flash-lite` 不開放給新用戶。

---

## 11. 待辦與待確認

**⚠️ 上線前必做**
- [x] ~~刪除正式資料庫的範例福利~~：2026-11-23 已刪除（`removed 7 mock programs`，列表總數回到 1,471）。

**需要你處理**（金鑰一律透過 https://key.cherites.org 的一次性連結提供，見 `~/Project/keydrop`）
- [x] ~~到 Cloudflare Dashboard 啟用 R2~~（已完成）
- [x] ~~建立 bucket `mou-welfare-backups` 與 30 天 lifecycle 規則~~（已完成）
- [x] ~~R2 上傳~~：2026-11-18 建立 bucket `mou-welfare-uploads`，並以實際上傳、公開下載、刪除驗證通過。
- [x] ~~上傳金鑰改為專用 token~~：2026-11-22 改用只限 `mou-welfare-uploads` 的 R2 token（實測可讀寫 uploads、存取 backups 被拒）。
- [x] ~~公開網址改為自訂網域~~：2026-11-18 綁定 `file.mou-welfare.com`（Cloudflare R2 自訂網域，TLS 1.2 以上），已實測讀取正常，並關閉 r2.dev 公開網址。
- [x] ~~在 Resend 驗證 `mou-welfare.com` 網域~~：2026-11-22 完成，`EMAIL_FROM=哞福利 <noreply@mou-welfare.com>`，改用只能寄信的 key。
- [x] ~~作廢並重發（Roll）備份用的 API Token~~：2026-11-22 完成，舊 token 驗證已失效，新 token 實測備份上傳成功。
- [x] ~~建立 R2 API Token 並填入 `backup.env`~~（已完成，但需重發，見上一項）
- [x] ~~確認騰訊雲安全群組對 5432 port 的規則~~（已確認沒問題）
- [x] ~~GitHub Actions 自動部署的 SSH 金鑰與 5 個 secrets~~：2026-11-22 完成。
- [x] ~~v1 資料庫連線~~：2026-11-24 `postgres.cherites.org` 已能解析；v1 同日停用。
- [x] ~~Gemini 儲值~~：2026-11-23 完成，已移除 `LLM_DRIVER=rules`，全量結構化完成；AI Studio 用量上限設為每月新台幣 300 元。
- [x] ~~LINE 登入的金鑰~~：2026-11-23 設定 `LINE_CHANNEL_ID`／`SECRET`（以 LINE token 端點驗證）與 LIFF ID（`apps/web/wrangler.jsonc`），已啟用。
- [ ] **Google 登入的金鑰**：建立 Google OAuth client（設定值見 §8.5.1），透過 key.cherites.org 提供 `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET`。
- [ ] **人工檢核被判為非福利的 455 筆**：在管理後台依縣市檢核（[admin.md](admin.md) §4.3），屏東縣 191 筆最多。

**之後再決定**
- [x] ~~`pg_hba.conf` 加入規則，限制 `mou_welfare` 只能連自己的資料庫~~：2026-11-24 改成白名單（§9）。
- [x] ~~關閉 5432 對外開放~~：2026-11-24 資料庫只聽本機（§9）；騰訊雲安全群組的 5432 規則待移除。
- [ ] pgvector 要不要升級：改用 PostgreSQL 官方的 PGDG 套件庫，可以裝到較新的版本（目前 0.6.0 已夠用）。
- [x] ~~v1 前端的 `VITE_LIFF_ID`~~：v1 已停用，不需要。
- [x] ~~外部監控~~：2026-11-23 GitHub Actions `uptime.yml` 每 30 分鐘檢查；結構化錯誤增加、爬蟲中斷與逾期由 API 每小時檢查並寄信（§8.4.2）。
- [x] ~~爬蟲排程~~：2026-11-23 起每 3 天（`docs/scraper.md` §10.4）。
- [ ] 台灣 IP 的爬蟲執行環境：其餘 10 縣市從東京連不到（`docs/scraper.md` §10.3）。
- [ ] 清理 pg-boss 舊工作：`completed` 預設保留 7 天，目前不需要處理；若改為長期保留，要加上 `cleanup` cron。

**P0 原型必須驗證**
- [ ] Nuxt 在 Workers 上做伺服器端渲染並呼叫東京的 API，熱門頁面的 TTFB（目標 p95 < 500ms，有快取時 < 100ms）。
- [ ] Better Auth 的 cookie 在 `mou-welfare.com`（Workers）和 `api.mou-welfare.com`（主機）之間能正常共用，包括 LIFF 的 ID Token 登入。
- [x] SSE 串流經過 Cloudflare 和 Caddy 不會被緩衝（2026-11-24 正式環境實測）。
- [x] ~~v2 的記憶體用量~~：2026-11-18 實測，合併為單一程序後為 150 MB（原本 api 加 worker 兩個程序合計 272 MB）。

---

## 12. 推進計畫

| 階段 | 內容 | 完成標準 |
|---|---|---|
| **P0 骨架與驗證** | monorepo（pnpm）、`packages/shared`、API（Hono + Drizzle + Better Auth + pg-boss）部署到 `api-v2.mou-welfare.com`、Nuxt 骨架部署到 Workers | 第 11 節四項驗證全部通過 |
| **P1 核心 API** ✅ | 個人資料、福利搜尋與詳情、資格比對、收藏、FAQ、權限 middleware、管理端 | 單元測試涵蓋比對邏輯和權限 helper；OpenAPI 文件產出（2026-11-23 管理端 `/v1/admin/*` 也完成） |
| **P2 資料流** ✅ | `/internal/ingest`、`/internal/remove`（HMAC）、pg-boss 結構化（Gemini / 規則備案）、embedding、和爬蟲 P0 對接 | 爬蟲推送 3 個縣市的資料，可以搜尋得到（正式環境 12 縣市 1,471 筆；2026-11-23 以 Gemini 全量結構化完成，可搜尋 985 筆） |
| **P3 家庭與聊天** | 家庭、邀請碼、聊天 RAG 串流 | 家庭、邀請碼、家庭模式比對、刪除帳號已完成（2026-11-22，`tests/family.test.ts`）；聊天（規則解析、混合檢索、SSE、每日 30 則、退回固定格式、前端）完成（2026-11-23，§8.9）；LINE Bot 共用聊天服務 2026-11-24 完成（§8.7） |
| **P4 LINE 與通知** | LINE webhook、LIFF 登入、Email 和 LINE 通知、cron 工作 | Google / LINE / LIFF 登入的程式已完成（2026-11-23，`tests/social.test.ts`）；LINE 與 LIFF 已啟用，Google 待設定金鑰；LINE Bot 對話 2026-11-24 完成（§8.7）；通知與 cron 未開始 |
| **管理後台** ✅ | 總覽、福利檢核、LLM 用量、使用者（唯讀）、稽核紀錄 | 2026-11-23 上線 `admin.mou-welfare.com`（[admin.md](admin.md)） |
| **P5 前端串接與上線** | Nuxt 串接 API、SEO（sitemap、JSON-LD）、依第 10.3 節切換網域 | ✅ 2026-11-24 切換網域、v1 停用（2026-11-23：登入註冊、個人設定、編輯個人資料、收藏、常見問題、服務條款、隱私權已依 v1 介面完成；福利列表與詳情也已完成；聊天 2026-11-23 完成；2026-11-24 主題頁（縣市、縣市 × 類別、人生階段）與詳情頁「分享到 LINE」） |

---

## 參考來源

- [Better Auth – LINE](https://better-auth.com/docs/authentication/line)、[Better Auth – Cloudflare Guide](https://better-auth.com/docs/guides/cloudflare.md)、[Hono – Better Auth on Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
- 先前評估 API 部署在 Workers 時的參考（已改為自有主機）：[Workers CPU exceeded（Better Auth）](https://answeroverflow.com/m/1344293536778031144)、[Better Auth + Hyperdrive](https://www.answeroverflow.com/m/1357795265108512808)、[Gemini location error from Workers](https://discuss.ai.google.dev/t/gemini-api-location-error-400-when-called-from-cloudflare-workers/188368)、[Cloudflare AI Gateway – Google AI Studio](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio)
