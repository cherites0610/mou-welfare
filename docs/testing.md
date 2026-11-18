# 測試規範（v2）

> 狀態：規範定案；測試資料庫與 uv 已就緒，CI 尚未建立
> 最後更新：2026-11-18
> 適用範圍：`apps/api`、`apps/web`、`packages/shared`、`services/scraper`
> 相關文件：[後端設計](backend.md)、[爬蟲設計](scraper.md)

---

## 1. 為什麼要訂這份規範

v1 **沒有任何自動化測試**，結果出了下面這幾類問題，而且都是上線後才發現：

| 類型 | v1 的實例 |
|---|---|
| 權限漏洞 | 多個端點忘了加 Guard；可以讀取或刪除別人的聊天紀錄；可以修改別人的家庭 |
| 前後端介面對不上 | LIFF 登入、福利詳情、聊天紀錄的路徑或 HTTP method 不一致，有些到現在還沒修好 |
| 邏輯錯誤 | 年齡只用年份相減；`simple-array` 用 `IN` 比對；`identity != '[]'` 永遠成立 |
| ORM 陷阱 | `where: { email: undefined }` 撈到第一個使用者，等於可以登入別人的帳號 |
| 默默失敗 | 爬蟲的 selector 失效時，把空白資料推進資料庫，沒有任何警告 |

這份規範的目標，就是讓**上面每一類問題，都會在 PR 階段被測試擋下來**。

---

## 2. 原則

1. **測試是合併的門檻**：CI 沒通過，PR 不能合併到 `main`。
2. **修 bug 一定要附測試**：先寫一個能重現 bug 的測試（會失敗），再修到測試通過。
3. **資料庫用真的 Postgres，不用 mock**：v1 最嚴重的 bug 出在 ORM 和 SQL 這一層，mock 掉就測不到。
4. **CI 不呼叫真實的外部服務**：LLM、LINE、Resend、R2 都透過介面換成假的實作。真實服務的測試另外分組，不擋 PR。
5. **測試要描述行為，不綁實作**：測「非成員讀取家庭會得到 403」，不測「呼叫了 `assertFamilyMember`」。
6. **測試要穩定**：會隨機失敗（flaky）的測試，視同壞掉的測試，必須當天修好，或先標記 skip 並開 issue。

---

## 3. 測試層級與工具

| 層級 | 範圍 | 工具 | 執行時機 |
|---|---|---|---|
| **單元** | 純函式：資格比對、年齡計算、身分相容規則、Zod schema、標題規則、日期解析 | Vitest（TS）、pytest（Python） | 每次 PR |
| **整合** | HTTP 路由加資料庫：權限、查詢、交易、pg-boss 工作 | Vitest + Hono `app.request()` + 真實 Postgres | 每次 PR |
| **契約** | OpenAPI 規格和前端 client 是否同步；爬蟲推送格式是否符合 schema | 產生檔比對（git diff）、JSON Schema 驗證 | 每次 PR |
| **元件** | Nuxt 元件、composable | Vitest + `@nuxt/test-utils` | 每次 PR |
| **E2E** | 從使用者角度跑完整流程 | Playwright | 合併到 `main` 後對 staging 執行；每晚執行一次 |
| **SEO** | 伺服器端渲染的 HTML 內容、meta、JSON-LD、sitemap | Playwright（關閉 JavaScript）加上自訂檢查 | 同 E2E |
| **評估（eval）** | LLM 輸出品質：福利結構化、雜訊分類、聊天回答 | 標註資料集加上評分腳本 | 改 prompt 或換模型時；每週一次 |
| **爬蟲金絲雀** | 對真實政府網站抓少量頁面，確認還能正常爬 | pytest（`-m live`），從台灣 IP 執行 | 每日爬取前 |
| **部署煙霧測試** | 部署後確認服務真的活著 | shell 腳本 | 每次部署後，失敗就自動回滾 |

---

## 4. 後端（`apps/api`）

### 4.1 測試資料庫

| 環境 | 做法 |
|---|---|
| CI（GitHub Actions） | service container 使用 `pgvector/pgvector:pg16` 映像檔，和正式環境同樣是 Postgres 16 加 pgvector |
| 本機開發 | 主機上的 Postgres，`mou_welfare_test` 資料庫（已建立，擁有者為 `mou_welfare`，見第 10 節） |

- 測試開始前執行 migration，確保資料表結構和正式環境完全相同。
- **每個測試檔跑在獨立的交易裡，結束後 rollback**；必須真的 commit 的測試（例如 pg-boss），改成在 `afterEach` 清空資料表。
- 測試資料用 factory 函式產生，例如 `createUser({ identities: ['低收入戶'] })`，不依賴固定的種子資料。
- **禁止使用正式環境的資料**，包括從 v1 匯出的資料，因為裡面有個資。需要真實樣本時，必須先去識別化。

### 4.2 權限矩陣測試（必要）

每個路由都要在一張表裡列出「誰可以做什麼」，再用參數化測試逐一驗證：

```ts
// apps/api/tests/permissions.test.ts
const matrix = [
  // route,                                  anon, user, member, admin, otherUser
  ['GET    /v1/families/:id',                 401,  403,  200,    200,   403],
  ['PATCH  /v1/families/:id',                 401,  403,  403,    200,   403],
  ['DELETE /v1/families/:id',                 401,  403,  403,    204,   403],
  ['GET    /v1/chat/sessions/:id',            401,  null, null,   null,  404],  // 擁有者 200，其他人 404
  ['POST   /internal/ingest',                 401,  401,  401,    401,   401],  // 只接受 HMAC
  // ...每個路由都要列
]
```

**另外要有一個「路由普查」測試**：列出 app 註冊的所有路由，逐一確認每個路由**要嘛在公開清單裡，要嘛在權限矩陣裡**。新增路由卻沒有登記，這個測試就會失敗。v1 的「忘了加 Guard」就是靠這個測試擋下來。

### 4.3 必須存在的回歸測試（來自 v1 的 bug）

| # | v1 的 bug | v2 必須有的測試 |
|---|---|---|
| R1 | `findOne({ where: { email: undefined } })` 回傳第一個使用者 | 用沒有 email 的 LINE 帳號登入，不能取得任何既有使用者的 session |
| R2 | 未設定 `API_KEY` 時，`undefined === undefined` 會通過驗證 | 未設定 `INGEST_HMAC_KEY` 時，應用程式**拒絕啟動**；簽章錯誤或時間戳過期時回傳 401 |
| R3 | `categories IN (...)` 比對 `simple-array` 欄位 | 一筆福利有多個類別時，用其中任一個類別篩選都找得到 |
| R4 | `identity != '[]'` 永遠成立，排序失效 | 有身分限制的福利排在前面；身分為空陣列的福利排在後面 |
| R5 | 年齡只用年份相減 | 今天的前一天、當天、後一天滿 20 歲和滿 65 歲，各自要歸到正確的年齡組 |
| R6 | `POST /welfare` 可帶任意 `userId` / `familyId` | 帶非自己所屬家庭的 `familyId`，回傳 403，而且回應裡不能出現該家庭成員的姓名或頭像 |
| R7 | 聊天 session 沒檢查擁有者 | 讀取、刪除、續聊別人的 session，一律回傳 404 |
| R8 | 任何登入者都能修改或刪除任何家庭 | 已涵蓋在權限矩陣 |
| R9 | 可以直接把任何人加進任何家庭 | 只能透過邀請碼加入；邀請碼過期、已使用、不存在時回傳 4xx |
| R10 | `PATCH /users/:id` 可以修改 `lineId` / `googleId` | 更新個人資料時帶這兩個欄位，會被忽略或拒絕，資料庫內容不變 |
| R11 | LINE webhook 沒驗證簽章 | 沒有簽章、簽章錯誤、body 被竄改，都回傳 401，而且不會排入任何工作 |
| R12 | `/upload` 不用登入 | 未登入回傳 401；非圖片格式或超過大小限制回傳 4xx |
| R13 | OAuth 的 `state` 沒驗證 | state 不符時拒絕登入（Better Auth 內建，測試要確認有啟用） |
| R14 | 忘記密碼的回應會透露 email 是否已註冊 | 已註冊和未註冊的 email，回應內容和狀態碼完全相同 |
| R15 | 驗證碼沒有嘗試次數限制 | 連續錯誤 N 次後鎖定；限流以 `CF-Connecting-IP` 計算 |

### 4.4 其他後端測試要求

- **資格比對**（`match()`）：分支覆蓋率 100%。紅、黃、綠三種結果，每一種至少各有一個中文情境案例。
- **搜尋**：中文關鍵字（pg_trgm）、多條件組合、分頁邊界（最後一頁、超出範圍的頁數）。
- **pg-boss 工作**：處理函式可以單獨呼叫測試；另外要有一個整合測試，走完「排入佇列 → 背景工作處理 → 資料庫更新」整個流程。也要測**失敗重試**，以及**同一個工作重複執行時結果不變**（冪等）。
- **LLM**：用 `FakeLLM` 實作 `lib/llm` 介面，依照輸入回傳預先錄好的結果。要測三種情況：回傳格式不符 schema（應重試一次後失敗）、逾時、成功。
- **環境變數**：缺少必要的變數時，應用程式拒絕啟動，並在錯誤訊息裡列出缺少的變數名稱。

---

## 5. 共用套件（`packages/shared`）

- 所有 Zod schema 都要有「合法」和「不合法」兩種輸入的測試。
- 身分白名單、類別白名單、相容規則（例如低收入戶也符合中低收入戶的條件）要有快照測試。改動時快照會失敗，必須在 PR 裡說明理由。
- 覆蓋率目標：90%。

---

## 6. 契約測試（前後端與爬蟲）

| 契約 | 檢查方式 |
|---|---|
| API 對前端 | CI 從 app 產生 `openapi.json`，再用 orval 產生前端 client；**只要產生的結果和 repo 裡的版本不同，CI 就失敗**（代表有人改了 API 卻沒有更新 client） |
| 爬蟲對 API | `packages/shared` 輸出推送格式的 JSON Schema（`ingest.schema.json`）；爬蟲端的 pytest 用它驗證每一筆輸出；API 端的測試用同一份 fixture 實際打 `/internal/ingest` |
| 破壞性變更 | OpenAPI 的變更會自動比對；刪除欄位或修改型別時，PR 必須加上 `breaking-change` 標籤 |

---

## 7. 前端（`apps/web`）

### 7.1 元件與 composable（Vitest + `@nuxt/test-utils`）

- 有邏輯的元件都要有測試，例如篩選列、福利卡的燈號、資格分析卡。純展示的元件不強制。
- composable（例如 session、篩選狀態）要測狀態轉換。
- 燈號、身分標籤的顏色要對應設計 token，用快照測試鎖住。

### 7.2 E2E 必測流程（Playwright）

| 流程 | 驗證重點 |
|---|---|
| 搜尋 → 詳情 → 返回 | 篩選條件和捲動位置要保留（v1 的 keep-alive 實際上沒有作用） |
| 未登入時收藏 | 導向登入頁，登入後回到原本的頁面並完成收藏 |
| Email 註冊 → 驗證 → 填寫資料 | 完成後首頁顯示個人的資格比對結果 |
| LINE 和 Google 登入 | 用 staging 的測試帳號，或在 staging 上換成假的 OAuth provider |
| 建立家庭 → 產生邀請碼 → 另一個帳號加入 | 兩個帳號都能看到家庭；福利卡上出現家人的資格比對 |
| 阿哞聊天 | 串流有逐字出現；參考來源卡可以點擊（staging 使用 FakeLLM） |
| 刪除帳號 | 刪除後無法再登入，相關資料也已清除 |

- 手機（iPhone、Android 尺寸）和桌機各跑一次。
- 已實作：`apps/web/e2e/auth-flow.cjs`（註冊 → 驗證信連結 → 填寫資料 → 登出 → 未登入導向 → 錯誤密碼 → 忘記 / 重設密碼 → 新密碼登入 → 手機版版面，共 12 步）。信件連結由 API 的 log 寄信模式取得。
- 每個頁面跑 axe 無障礙檢查，**不能有 critical 等級的問題**。

### 7.3 SEO 測試

在關閉 JavaScript 的情況下抓取頁面，確認伺服器端渲染的 HTML 已經包含：
- `<title>`、`meta description`、`canonical`、`og:*`
- 福利詳情頁的 JSON-LD
- 登入、註冊等頁面有 `noindex`

另外要驗證 `sitemap.xml` 包含所有 `active` 狀態的福利，而且不包含已下架的福利。

---

## 8. 爬蟲（`services/scraper`）

| 類型 | 要求 |
|---|---|
| **HTML 快照** | 每個站點至少存一組列表頁加 3 篇內文頁，放在 `tests/fixtures/{site}/`；adapter 測試只讀快照，不連網路 |
| **抽取結果快照** | 每篇快照頁面的抽取結果（標題、日期、正文 Markdown、附件）存成 `.expected.json`；改動抽取邏輯時，差異要在 PR 裡逐筆說明 |
| **附件解析** | PDF（文字和掃描）、DOCX、ODT、DOC 各準備一個樣本 |
| **標題規則** | 「會議紀錄」「徵選補助單位」「補助民間團體」等雜訊，各自要有被排除的案例；「生活津貼」「補助」等也要有不能被誤殺的案例 |
| **品質關卡** | 空白標題、過短內文、未來日期、重複內容，各要有被隔離的案例（v1 默默失敗的回歸測試） |
| **狀態判斷** | 新增、更新、未變、下架四種狀態的轉換 |
| **健康檢查** | 抓到的數量少於上次的 50% 時，狀態變為 `degraded`，而且該站這次的結果不推送 |
| **分類評估（eval）** | 200 篇人工標註資料（A、B、C 三族各 2 站）；目標準確率 ≥ 95%、召回率 ≥ 90%；**改 prompt 或換模型時必須重跑，並附上結果** |
| **金絲雀（live）** | `pytest -m live`：每站抓 1 個列表頁加 1 篇內文頁，檢查結構還在；從台灣 IP 執行，失敗就發警告，**不擋 PR** |

快照要定期更新：金絲雀測試發現網站改版時，重新抓取該站的快照，並更新 expected 結果。

---

## 9. CI 流程（GitHub Actions）

```
PR 開啟 / 更新
 ├─ lint（eslint、ruff）+ 型別檢查（tsc、vue-tsc、mypy）
 ├─ 單元測試（TS 和 Python 並行）
 ├─ 整合測試（Postgres service container）
 ├─ 契約檢查（OpenAPI → client 有沒有差異；ingest schema）
 ├─ 覆蓋率門檻
 └─ build（api、web）
      全部通過才能合併

合併到 main
 ├─ 部署 API 到主機（staging：api-v2.mou-welfare.com）→ 煙霧測試 → 失敗就回滾
 ├─ 部署 web 到 Workers 的預覽環境
 └─ 對 staging 跑 E2E 和 SEO 測試

每晚
 ├─ 完整 E2E（手機加桌機）
 └─ 爬蟲金絲雀（GCP 台灣，另外排程）
```

- **PR 檢查的時間預算 < 10 分鐘**：超過就把慢的測試移到每晚執行，或改成平行執行。
- `main` 分支要設定保護規則：必須通過 CI 才能合併，禁止 force push。

### 9.1 覆蓋率門檻

| 範圍 | 門檻 |
|---|---|
| `packages/shared` | 行覆蓋率 ≥ 90% |
| `apps/api` | 行覆蓋率 ≥ 75%；資格比對和權限 helper 的分支覆蓋率 100% |
| `services/scraper` | 行覆蓋率 ≥ 75%；`filter/`、`quality.py` 的分支覆蓋率 100% |
| `apps/web` | 不設整體門檻；第 7.2 節的 E2E 流程必須全部存在 |

> 覆蓋率只是最低要求，不是目標。權限矩陣和回歸清單（第 4.2、4.3 節）比百分比重要。

### 9.2 部署煙霧測試

API 執行 `pm2 reload` 之後：
1. `GET /health` 回傳 200，而且回應內容包含資料庫連線狀態和目前的 migration 版本。
2. 用一個公開端點實際查詢資料庫，例如 `GET /v1/faq`。
3. 背景工作在 30 秒內回報心跳（`/health` 的 `jobs.lastBeatSecondsAgo`；`WORKER_MODE=separate` 時檢查獨立的 worker 程序）。

任何一項失敗，就切回上一個版本，並發出通知。

---

## 10. 開發環境準備（待辦）

- [x] ~~在主機的 Postgres 建立 `mou_welfare_test`~~（2026-11-18 完成：擁有者為 `mou_welfare`，已啟用 `vector 0.6.0`、`pg_trgm 1.6`、`pgcrypto 1.3`；帳密已加入 `~/.pgpass`）
- [x] ~~主機安裝 `uv`~~（2026-11-18 完成：`uv 0.13.9`，安裝在 `~/.local/bin`，並在 `~/.zshenv` 加入 PATH；已實測 `uv run pytest`）
- [x] ~~建立 `.github/workflows/ci.yml`（PR）~~（P0 骨架已加入：typecheck、單元、契約、API 整合（pgvector 容器）、爬蟲 ruff / mypy / pytest、build）
- [ ] `deploy.yml`（main）、`nightly.yml`（部署與 E2E 建立後再加）
- [ ] GitHub 上 `main` 分支的保護規則。
- [ ] 建立 staging 用的 LINE 和 Google OAuth 測試應用程式。

---

## 11. 檔案結構與命名

```
apps/api/
├── src/features/welfare/matching.ts
├── src/features/welfare/matching.test.ts     # 單元測試：和原始碼放在一起
└── tests/
    ├── setup.ts                             # 測試資料庫、migration、交易 rollback
    ├── factories.ts
    ├── permissions.test.ts                  # 權限矩陣 + 路由普查
    ├── regressions.test.ts                  # R1–R15
    └── integration/*.test.ts

apps/web/
├── components/**/*.test.ts
└── e2e/*.spec.ts                            # Playwright

services/scraper/tests/
├── fixtures/{site}/*.html
├── fixtures/{site}/*.expected.json
├── test_{adapter}.py
├── test_filter.py
├── test_quality.py
└── live/test_canary.py                      # @pytest.mark.live
```

- 測試名稱用中文描述行為，例如 `it('非成員讀取家庭回傳 403')`，讓失敗訊息一看就懂。
- 回歸測試的名稱要加上編號，例如 `R5 年齡：生日前一天未滿 65 歲`。

---

## 12. 完成的定義（Definition of Done）

一個 PR 必須同時符合下面每一項，才算完成：

- [ ] 新功能有對應的單元測試或整合測試。
- [ ] 新增的路由已登記到權限矩陣（否則路由普查測試會失敗）。
- [ ] 修 bug 的 PR 附有能重現該 bug 的測試。
- [ ] API 有改動時，OpenAPI 和前端 client 已重新產生。
- [ ] 改了 prompt 或模型時，附上 eval 結果。
- [ ] CI 全部通過，沒有新增 skip 的測試（必要時要開 issue 追蹤）。
