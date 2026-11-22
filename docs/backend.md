# 後端設計文件（v2）

> 狀態：實作中（P2 資料流已上線；P1 核心 API、家庭與帳號管理已完成；前端個人設定相關頁面已上線，見第 12 節）
> 最後更新：2026-11-23（個人設定頁、6 碼邀請碼、訂閱通知欄位、v1 資料庫連線異常）
> 相關文件：[爬蟲設計](scraper.md)、[v1 文件](v1/)

---

## 1. 決策摘要

> 2026-11-18 調整：**API 改部署在自有主機**（`postgres.cherites.org` 這台），前端 Nuxt 維持在 Cloudflare。目的是避開 Workers 的執行時間、CPU、常駐程序等限制。

| 項目 | 決定 | 取代 v1 的 | 理由 |
|---|---|---|---|
| 前端 | **Nuxt**（SSR），部署在 **Cloudflare Workers** | Vue SPA（由主機上的 Caddy 提供） | 重視 SEO，伺服器端渲染在 Cloudflare 機房執行（台灣有機房），也分擔主機記憶體 |
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
- `mou-welfare.com`：Nuxt（Cloudflare）
- `api.mou-welfare.com`：主機上的 Caddy，代理到 v2 API。過渡期間 v1 仍佔用這個網域，所以 v2 先用 `api-v2.mou-welfare.com`，切換方式見第 10 節。

---

## 3. Monorepo 結構

```
mou-welfare/
├── apps/
│   ├── web/                    # Nuxt
│   └── api/                    # Hono on Node（pm2）
│       ├── ecosystem.config.cjs  # pm2：預設只有 api 一個程序
│       ├── drizzle.config.ts
│       ├── drizzle/            # migrations
│       └── src/
│           ├── server.ts       # HTTP 入口（@hono/node-server）
│           ├── worker.ts       # 獨立背景工作入口，只在 WORKER_MODE=separate 時使用
│           ├── app.ts          # 路由組裝、全域 middleware
│           ├── env.ts          # 環境變數驗證（Zod，缺少必要值就拒絕啟動）
│           ├── db/
│           │   ├── client.ts   # 連線池（postgres driver，連 localhost）
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
│           ├── jobs/           # pg-boss 的工作處理函式與 cron 定義；startJobs() 由 server.ts 或 worker.ts 呼叫
│           └── lib/
│               ├── llm/        # 介面 + gemini.ts
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
| 長時間工作 | LLM 結構化、批次通知 | 一律放進 pg-boss 佇列，由同一程序內的背景工作處理；結構化的同時處理數設為 1–2，避免影響 API 回應。工作量變大時改 `WORKER_MODE=separate` 拆成獨立程序（不需改程式） |
| 聊天串流 | SSE 長連線經過 Cloudflare 和 Caddy | Caddy 的 `reverse_proxy` 對 SSE 加 `flush_interval -1`；API 網域若開啟 Cloudflare 代理，要確認串流不會被緩衝 |
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
| `role` | `text` | `user` / `admin` |

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
ingest_log(id, program_key, source_url, action, content_hash, received_at)   -- action: created | updated | unchanged | removed
welfare_sources(url pk, program_id, site_id, content_hash, first_seen_at, last_seen_at)
  -- 一個福利可能來自多個網址（同一福利出現在多個分類）；所有網址都下架才把福利標為 removed
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
| 個人 | `GET/PATCH /v1/me`（含 `isSubscribed` 訂閱通知、`createdAt`）、`DELETE /v1/me`（body 必須有 `"confirm":"DELETE"`；有密碼的帳號另需 `password`） | 登入 |
| 收藏 | `GET /v1/me/favorites?familyId=`、`PUT/DELETE /v1/me/favorites/:programId` | 登入 |
| 福利 | `GET /v1/welfare?q=&city=&category=&familyId=&page=`、`GET /v1/welfare/:id?familyId=` | 公開；**帶比對結果時以登入身分為準**，不再接受從前端傳 `userId`；帶 `familyId` 時必須登入（401）且為成員（403） |
| 試算 | `POST /v1/welfare/simulate`（手動輸入身分試算） | 公開 |
| 家庭 | `GET/POST /v1/families`、`GET/PATCH/DELETE /v1/families/:id` | 登入；查看需為成員，修改或刪除需為 admin |
| 成員 | `GET /v1/families/:id/members`、`PATCH/DELETE /v1/families/:id/members/:userId` | 成員 / admin |
| 邀請 | `POST /v1/families/:id/invites`、`GET /v1/invites/:code`（加入前預覽：家庭名稱與人數）、`POST /v1/invites/:code/accept` | admin / 登入 |
| 聊天 | `GET/POST /v1/chat/sessions`、`GET/DELETE /v1/chat/sessions/:id`、`POST /v1/chat/sessions/:id/messages`（SSE 串流） | 登入，且需為 session 擁有者 |
| FAQ | `GET /v1/faq`；`POST/PATCH/DELETE /v1/admin/faq/*` | 公開 / admin。2026-11-23 起前端常見問題直接寫死在 `apps/web/app/utils/faqs.ts`（v1 的 10 題原文），不呼叫這個端點；端點保留給部署煙霧測試使用，資料表目前是空的 |
| 上傳 | `POST /v1/uploads/avatar`（multipart；以內容判斷格式，只收 JPEG/PNG/WebP/GIF，上限 5 MB；壓縮為 512×512 WebP 並移除 EXIF 後存到 R2） | 登入 |
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
- 排序（全部在 SQL 完成）：有身分限制的福利優先 → 登入時，身分與使用者可能符合的（`identities && 使用者可滿足的身分`，含相容規則）優先 → 發布日期新到舊。精確的紅黃綠燈只對當頁計算。
- 存取類型 `optional`：搜尋與詳情不需登入；有登入時才附上比對結果與收藏狀態。

### 8.3 LLM（`lib/llm`）

```ts
export interface LLM {
  generate<T>(o: { system: string; input: string | Part[]; schema: z.ZodType<T>; model?: string }): Promise<T>
  stream(o: { system: string; messages: Message[] }): AsyncIterable<string>
  embed(texts: string[]): Promise<number[][]>
}
```

- **實作**：`gemini.ts`（`@google/genai`）。可選擇經過 Cloudflare AI Gateway 來看用量和做快取，但不是必要。
- **結構化輸出**：用 `z.toJSONSchema()` 把 Zod schema 轉成 Gemini 的 `responseSchema`，回傳後再用 Zod 驗證；不合格就重試一次，帶上錯誤訊息。
- **Embedding**：用 Gemini 的 embedding 模型輸出 768 維（`gemini-embedding-001` 支援 `outputDimensionality`），正規化後存入 pgvector。
- **沒有金鑰時**（`GEMINI_API_KEY` 未設定或 `LLM_DRIVER=rules`）：改用關鍵字規則結構化（`features/welfare/structure.ts` 的 `RuleStructurer`），只依標題標身分、寧可少標；不做 embedding。資料可以先被搜尋到。設定金鑰後重新啟動，啟動時的 backfill 會把規則結構化的福利全部重新排入。
- **身分欄位的語意**：`identities` 是「一定要具備」的身分，多個特殊身分視為全部都要；「A 或 B」不列、「低收入戶或中低收入戶」只列中低收入戶（`match()` 的相容規則會涵蓋）。這段寫在 prompt 裡，規則版也遵守。

| 用途 | 時機 | 執行位置 |
|---|---|---|
| 福利結構化 | 爬蟲送來新增或更新的資料 | 背景工作（pg-boss） |
| Embedding | 結構化完成後 | 同一個背景工作 |
| 阿哞聊天（RAG） | 使用者發問 → 向量搜尋取前 k 筆，加上資格比對 → 串流回答 | api 程序（SSE） |

### 8.4 背景工作

| 名稱 | 類型 | 內容 |
|---|---|---|
| `welfare-structure` | pg-boss 佇列 | 結構化、embedding、寫回資料庫；一次一筆；失敗重試 3 次（指數退避，30 秒起）。內容 hash 沒變就略過，所以重複執行是安全的；啟動時補送遺失的工作（backfill）。結構化期間內容又被更新時不寫回，由新的工作處理 |
| `notify` | pg-boss 佇列 | Email（Resend）、LINE push |
| `deadline-reminder` | pg-boss cron（每日） | 通知收藏的福利即將截止 |
| `expire` | pg-boss cron（每日） | 把超過截止日的福利標為 `expired` |
| `cleanup` | pg-boss cron（每週） | 清除過期的邀請碼、session、verification |

### 8.5 帳號信件與限流

- 註冊後寄出驗證信，**未驗證不能登入**；點擊連結後自動登入（Better Auth `emailVerification`）。
- 重設密碼信 1 小時內有效；重設後登出所有既有 session。對不存在的 email 回應完全相同、但不寄信（R14）。
- 信件為繁體中文 HTML 加純文字版本，使用者名稱一律跳脫（`apps/api/src/lib/mail/templates.ts`）。
- 寄件人：Resend 網域驗證前使用 `onboarding@resend.dev`，此時**只能寄給 Resend 帳號本人**；正式上線前要在 Resend 驗證 `mou-welfare.com` 並改 `EMAIL_FROM`。
- 限流（R15，以 `CF-Connecting-IP` 計算）：登入、註冊每 IP 每分鐘 5 次；重設密碼、重寄驗證信每 IP 每 5 分鐘 3 次。目前存在記憶體（單一程序足夠），改為多程序時要換成資料庫儲存。

### 8.6 圖片上傳

- 以 sharp 處理：依 EXIF 轉正 → 512×512 裁切（依顯著區域） → WebP 品質 80 → 移除全部中繼資料（含 GPS）。
- 以實際內容判斷格式，不相信 Content-Type 與副檔名；拒絕 SVG（可能含腳本）；`limitInputPixels` 防止解壓縮炸彈。
- 儲存路徑 `avatars/{userId}/{uuid}.webp`，上傳後更新 `user.image`。

### 8.7 LINE Bot

- **驗證**：webhook 收到後先驗證簽章，把事件排入 pg-boss 佇列後立即回應 200，回覆由背景工作處理：優先用 reply token 回覆（有時效限制），來不及時改用 push API。
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
- 5432 port 目前對外開放（`pg_hba` 允許 `0.0.0.0/0` 用密碼連線，`ufw` 未啟用）。依目前決定**暫不變更**。API 改部署在同一台主機後，v2 不再需要從外部連資料庫，之後可以關閉對外開放（見第 11 節）。

---

## 10. 部署

### 10.1 API（自有主機）

| 項目 | 做法 |
|---|---|
| 程式位置 | `~/apps/mou-welfare-v2/`（部署用的 checkout，**和開發用的 `~/Project/mou-welfare` 分開**，避免再次影響正式環境） |
| 程序 | pm2：`mou-welfare-v2-api`（port 5030，只聽 127.0.0.1），背景工作在同一程序內（`WORKER_MODE=inline`）；設定寫在 `ecosystem.config.cjs`，`pm2 save` 確保開機會自動啟動 |
| HTTPS | Caddy：`api-v2.mou-welfare.com { reverse_proxy 127.0.0.1:5030 }`，切換後改為 `api.mou-welfare.com` |
| 環境變數 | `~/.config/mou-welfare/api.env`（權限 600，不進版控）：`DATABASE_URL`、`BETTER_AUTH_SECRET`、`GOOGLE_*`、`LINE_*`、`GEMINI_API_KEY`、`INGEST_HMAC_KEY`；寄信 `MAIL_DRIVER=resend`、`RESEND_API_KEY`、`EMAIL_FROM`（已設定）；上傳 `STORAGE_DRIVER=r2`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_PUBLIC_BASE_URL`（已設定：bucket `mou-welfare-uploads`，公開網址 `https://file.mou-welfare.com`，專用 R2 token）；`GEMINI_API_KEY`（已設定，但目前 `LLM_DRIVER=rules`，見下方「目前狀態」）。完整定義見 `apps/api/src/env.ts` |
| 資料庫連線 | `postgresql://mou_welfare@localhost:5432/mou_welfare` |
| Migration | 部署腳本中執行 `drizzle-kit migrate`，成功後才重啟程序 |
| 部署流程 | 在主機上執行 `~/apps/mou-welfare-v2/ops/deploy-api.sh`：拉取 `origin/main` → `pnpm install --frozen-lockfile` → build → migration → `pm2 reload`（不中斷服務）→ 煙霧測試（`/health` 為 ok、`/v1/faq` 可回應）；**失敗時自動退回上一版**。migration 不會自動回復，因此必須維持向前相容。GitHub Actions（`deploy.yml`）在 CI 通過後透過 SSH 傳入 commit SHA 觸發：authorized_keys 以 `command="…/deploy-api.sh --from-ssh"` 限定這把金鑰只能執行部署，`--from-ssh` 模式只接受完整的 40 碼 SHA（其他內容、包括空白一律拒絕）。設定見 `docs/deploy-setup.md` |
| 日誌 | pm2 日誌加上 pm2-logrotate（主機上已安裝） |
| 監控 | 外部定時檢查 `/health`（例如 UptimeRobot 或 Cloudflare Health Checks）；錯誤追蹤可選 Sentry |

**目前狀態（2026-11-23）**

| 項目 | 狀態 |
|---|---|
| 部署目錄 | ✅ `~/apps/mou-welfare-v2`（獨立的 git clone），目前為 `main` 最新版 |
| 資料庫 | ✅ 正式資料庫 `mou_welfare` 已套用 5 個 migration（`0002_ingest`：`welfare_sources`、`ingest_log`、福利狀態 `pending` / `rejected`；`0003_family`：家庭、成員、邀請碼；`0004_subscribed`：`user.is_subscribed`） |
| pm2 | ✅ `mou-welfare-v2-api` 運作中（約 120 MB），已 `pm2 save` |
| Caddy | ✅ `api-v2.mou-welfare.com` → `127.0.0.1:5030`（`flush_interval -1`），修改前的設定備份在 `/etc/caddy/Caddyfile.bak-*` |
| DNS | ✅ `api-v2.mou-welfare.com` A 紀錄 → `43.130.226.136`（Proxied） |
| 自動部署 | ✅ 2026-11-22 設定完成：CI 通過後部署 API（SSH）與前端（Workers），再做正式環境煙霧測試；最近一次（`6a7ec4b`，2026-11-23）API 已套用新 migration、前端新頁面皆回 200 |
| 福利資料 | ✅ 2026-11-22 共 13 個來源、**12 縣市、1,471 筆福利**（第一批：金門、新北、基隆、臺中開放資料 463 筆；第二批：臺北、桃園、臺南、嘉義市、屏東、宜蘭、花蓮、彰化、桃園開放資料 1,008 筆），見 `docs/scraper.md` §10.3 |
| 結構化 | ⚠️ 目前全部由**關鍵字規則**結構化（`LLM_DRIVER=rules`），沒有 embedding。原因：Gemini 帳戶的預付額度用完（API 回 `402 RESOURCE_EXHAUSTED`，2026-11-22 實測）。儲值後把 `api.env` 的 `LLM_DRIVER` 刪除或改為 `gemini` 並重啟，啟動時的 backfill 會把規則結構化的福利全部重新排入 |
| 爬蟲排程 | ⏸ 還沒有排程；目前在主機上手動執行（`~/.config/mou-welfare/scraper.env` 提供 `API_BASE`、`INGEST_HMAC_KEY`），見 `docs/scraper.md` §10.2 |

**事故紀錄**

- **2026-11-22 重複的結構化工作**：每次重啟時 backfill 都把所有尚未結構化的福利重新排入，多次重啟後累積約 2,200 個重複工作。重複執行本身是安全的（hash 沒變就略過），但在 Gemini 模式下會重複呼叫 API。已修正為略過已在佇列中的福利（`be05feb`）。
- **2026-11-22 改回規則時覆蓋了 LLM 的結果**：結構化只比對「方式是否相同」，從 gemini 改回 rules 時，LLM 已完成的結果會被規則版本覆蓋。已修正為內容沒變時不覆蓋 LLM 的結果。

### 10.2 前端（Cloudflare）

| 項目 | 做法 |
|---|---|
| 部署 | `pnpm --filter @mou-welfare/web build && pnpm --filter @mou-welfare/web run deploy`（要加 `run`：pnpm 有同名的內建指令 `deploy`；`apps/web/wrangler.jsonc`，Worker 名稱 `mou-welfare-web`）。GitHub Actions（`deploy.yml`）在 CI 通過後自動部署，設定見 `docs/deploy-setup.md` |
| 呼叫 API | 環境變數 `NUXT_PUBLIC_API_BASE`（目前為 `https://api-v2.mou-welfare.com`）。瀏覽器以 `credentials: 'include'` 呼叫，API 以 CORS 只允許 `TRUSTED_ORIGINS` 帶 cookie。session cookie 屬於 API 網域，所以登入相關與個人頁面設為只在瀏覽器渲染（`routeRules` 的 `ssr: false`）；公開頁面（福利列表、詳情）維持 SSR |
| 網域 | 過渡期為 `v2.mou-welfare.com`（Workers 自訂網域）；正式切換時改為 `mou-welfare.com`（目前仍由 Caddy 提供 v1） |
| 目前狀態 | ✅ 2026-11-19 部署，2026-11-22 起由 GitHub Actions 自動部署，外部檢查各頁 200、`/welfares` 為 SSR；瀏覽器實測跨網域呼叫 API 正常。API 的 `TRUSTED_ORIGINS` 已加入 `https://v2.mou-welfare.com` |
| 已完成頁面 | 登入註冊流程；福利列表與詳情（粗糙版，檢核爬蟲資料用）；2026-11-23 依 v1 介面完成：個人設定 `/profile`（家庭管理、邀請 QR Code、帳號管理）、編輯個人資料 `/profile/edit`、收藏 `/favorites`、常見問題 `/question`（SSR，含 FAQPage JSON-LD）、服務條款 `/terms`、隱私權政策 `/private` |

### 10.3 從 v1 切換到 v2

1. v2 在 `api-v2.mou-welfare.com` 和 Workers 的預覽網址上完成測試。
2. 搬移 v1 資料（範圍見第 11 節）。
3. 切換網域：`mou-welfare.com` 指向 Workers；Caddy 的 `api.mou-welfare.com` 改代理到 5030。
4. 觀察一週，沒有問題就停掉 v1：pm2 刪除 `mou-welfare-api`，停用 Redis，刪除 v1 的兩個 worktree，Caddyfile 移除 v1 設定。

### 10.4 v1 正式環境現況（2026-11-18 修復後）

| 元件 | 位置 |
|---|---|
| API | pm2 `mou-welfare-api`，執行 `~/Project/mou-welfare-v1/api/dist/main.js`（git worktree，`c1ba047` 加上綁定 HOST 的修改），port 5009 |
| 前端 | Caddy 提供 `~/Project/mou-welfare-v1-web/web/dist`（git worktree，`v1-web`），build 時沒有 `VITE_LIFF_ID` |
| 注意 | v1 的 `.env` 設定了 `DB_SYNC=true`，**不要在 v1 上部署其他版本**，否則 TypeORM 會自動修改資料表結構 |
| ⚠️ 2026-11-23 | v1 API 連不到資料庫：`getaddrinfo ENOTFOUND postgres.cherites.org`（主機上也查不到這個網域），所有讀資料庫的 API 回 500。v2 透過 localhost 連線不受影響。待確認 DNS 紀錄（見第 11 節） |

**預估月費**：前端用 Cloudflare Workers（先用免費方案，SSR 若超出 CPU 限制再升級 Paid，每月 5 美元）；R2 在免費額度內；主機為現有資源；Gemini 依用量計費（預付制，額度用完會回 402，結構化工作會重試 3 次後停在 failed，資料維持規則版或舊版結果）。

**Gemini 用量估算**：每筆福利結構化一次（輸入上限 16,000 字，含附件文字）加一次 embedding。首次全量約 470 筆；之後只有爬蟲判定內容變動的才會重做，日常每天個位數到數十筆。換模型或改 prompt 時才需要全量重做。

---

## 11. 待辦與待確認

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
- [ ] **v1 資料庫連線**：2026-11-23 發現 `postgres.cherites.org` 無法解析，v1 API 讀資料庫全部失敗（見 §10.4）。確認 DNS 紀錄是否被刪除或過期。
- [ ] **Gemini 儲值**：預付額度已用完（2026-11-22），儲值後把 `api.env` 的 `LLM_DRIVER=rules` 刪除並重啟 API。建議在 AI Studio 設定用量上限與通知。

**之後再決定**
- [ ] `pg_hba.conf` 加入規則，限制 `mou_welfare` 只能連自己的資料庫。
- [ ] 關閉 5432 對外開放：API 和資料庫在同一台，爬蟲也透過 API 推資料，所以資料庫只需要聽 localhost（另外兩個專案若需要遠端連線，可改用 Tailscale，主機上已有）。
- [ ] pgvector 要不要升級：改用 PostgreSQL 官方的 PGDG 套件庫，可以裝到較新的版本（目前 0.6.0 已夠用）。
- [ ] 從 v1 資料庫 `mou-welfare` 搬資料（使用者、家庭、收藏）的範圍和方式。
- [ ] v1 前端的 `VITE_LIFF_ID`（知道的話可以重新 build v1，讓 LINE 內自動登入恢復）。
- [ ] 外部監控：定時檢查 `/health`，並在結構化工作持續失敗（`structure_error` 增加）時通知。
- [ ] 清理 pg-boss 舊工作：`completed` 預設保留 7 天，目前不需要處理；若改為長期保留，要加上 `cleanup` cron。

**P0 原型必須驗證**
- [ ] Nuxt 在 Workers 上做伺服器端渲染並呼叫東京的 API，熱門頁面的 TTFB（目標 p95 < 500ms，有快取時 < 100ms）。
- [ ] Better Auth 的 cookie 在 `mou-welfare.com`（Workers）和 `api.mou-welfare.com`（主機）之間能正常共用，包括 LIFF 的 ID Token 登入。
- [ ] SSE 串流經過 Cloudflare 和 Caddy 不會被緩衝。
- [x] ~~v2 的記憶體用量~~：2026-11-18 實測，合併為單一程序後為 150 MB（原本 api 加 worker 兩個程序合計 272 MB）。

---

## 12. 推進計畫

| 階段 | 內容 | 完成標準 |
|---|---|---|
| **P0 骨架與驗證** | monorepo（pnpm）、`packages/shared`、API（Hono + Drizzle + Better Auth + pg-boss）部署到 `api-v2.mou-welfare.com`、Nuxt 骨架部署到 Workers | 第 11 節四項驗證全部通過 |
| **P1 核心 API** | 個人資料、福利搜尋與詳情、資格比對、收藏、FAQ、權限 middleware | 單元測試涵蓋比對邏輯和權限 helper；OpenAPI 文件產出（2026-11-22 除管理端 `/v1/admin/*` 外已完成） |
| **P2 資料流** ✅ | `/internal/ingest`、`/internal/remove`（HMAC）、pg-boss 結構化（Gemini / 規則備案）、embedding、和爬蟲 P0 對接 | 爬蟲推送 3 個縣市的資料，可以搜尋得到（2026-11-22 正式環境 4 縣市 463 筆；Gemini 結構化待儲值後補做） |
| **P3 家庭與聊天** | 家庭、邀請碼、聊天 RAG 串流 | 家庭、邀請碼、家庭模式比對、刪除帳號已完成（2026-11-22，`tests/family.test.ts`）；聊天未開始 |
| **P4 LINE 與通知** | LINE webhook、LIFF 登入、Email 和 LINE 通知、cron 工作 | — |
| **P5 前端串接與上線** | Nuxt 串接 API、SEO（sitemap、JSON-LD）、依第 10.3 節切換網域 | v1 停用（2026-11-23：登入註冊、個人設定、編輯個人資料、收藏、常見問題、服務條款、隱私權已依 v1 介面完成；福利列表與詳情仍是粗糙版） |

---

## 參考來源

- [Better Auth – LINE](https://better-auth.com/docs/authentication/line)、[Better Auth – Cloudflare Guide](https://better-auth.com/docs/guides/cloudflare.md)、[Hono – Better Auth on Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
- 先前評估 API 部署在 Workers 時的參考（已改為自有主機）：[Workers CPU exceeded（Better Auth）](https://answeroverflow.com/m/1344293536778031144)、[Better Auth + Hyperdrive](https://www.answeroverflow.com/m/1357795265108512808)、[Gemini location error from Workers](https://discuss.ai.google.dev/t/gemini-api-location-error-400-when-called-from-cloudflare-workers/188368)、[Cloudflare AI Gateway – Google AI Studio](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio)
