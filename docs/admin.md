# 管理後台（v2）

> 狀態：第一版上線（2026-11-23），https://admin.mou-welfare.com
> 最後更新：2026-11-25
> 範圍：`apps/admin`（前端）、`apps/api/src/features/admin`（API）
> 相關文件：[後端設計](backend.md)（§8.3 結構化與 LLM 用量、§8.4.1 額度保護）、[測試規範](testing.md)、[自動部署設定](deploy-setup.md)

---

## 1. 目的

- **檢核 LLM 結構化的結果**：全量結構化後有 455 筆被判為「不是個人福利」，不會出現在列表。後台讓管理者依縣市篩選、對照原文，逐筆判定。
- **看系統的整體狀況**：各縣市福利數量、結構化狀態、LLM 的 token 與費用、使用者數、爬蟲來源。
- **處理客服問題**：查詢使用者帳號、個人資料、家庭（唯讀）。

不做的事：

- 不在後台修改使用者資料或角色。
- 不直接編輯福利的結構化欄位（名稱、摘要、身分等）。要改就重新結構化，或調整 prompt 並跑回測（backend.md §8.3.1）。

---

## 2. 架構

```
瀏覽器 ── admin.mou-welfare.com（Cloudflare Workers，只有靜態檔）
   │
   └─ fetch（credentials: include）──▶ api.mou-welfare.com /v1/admin/*（Hono，access = 'admin'）
                                          └─ Postgres：welfare_programs、llm_calls、admin_audit …
```

| 項目 | 做法 |
|---|---|
| 前端 | `apps/admin`：Nuxt 4 單頁應用（`ssr: false`）、Element Plus、Tailwind、ECharts（`vue-echarts`，只載入長條圖與折線圖） |
| 建置 | `nuxt generate` 產生 `.output/public`。API 位址在建置時以 `NUXT_PUBLIC_API_BASE` 寫入，前台網址用 `NUXT_PUBLIC_WEB_BASE` |
| 部署 | Workers 只放靜態資產（`apps/admin/wrangler.jsonc`，Worker 名稱 `mou-welfare-admin`），找不到的路徑回 `index.html`。自訂網域 `admin.mou-welfare.com`。`/login` 會被轉到 `/login/`（307） |
| 登入 | 和使用者網站共用 Better Auth 帳號（Email 密碼、LINE，或之後啟用的 Google；管理者的 Email 必須已驗證，LINE 沒有提供 email 的帳號不能當管理者）。後台和 API 同在 `mou-welfare.com` 底下，API 網域的 session cookie 會照常送出 |
| CORS | `api.env` 的 `TRUSTED_ORIGINS` 包含 `https://admin.mou-welfare.com`。Better Auth 的 `trustedOrigins` 用同一個設定 |
| 搜尋引擎 | `<meta name="robots" content="noindex, nofollow">`；`robots.txt` 為 `Disallow: /` |

**為什麼做成獨立專案**：和使用者網站分開部署、分開網域，後台的程式碼與相依套件（ECharts 等）不會進到使用者網站。代價是登入頁和版面要另外做一份。

---

## 3. 權限

| 層級 | 檢查 |
|---|---|
| API（真正的檢查） | `access.ts` 的存取等級 `admin`：要登入（否則 401），而且 Email 已驗證、`user.role = 'admin'`（否則 403）。所有 `/v1/admin/*` 都登記為 `admin`；路由普查測試確保沒有漏登記 |
| 前端（只負責導向） | `middleware/admin.global.ts`：沒有 session 就導到 `/login?next=…`；不是管理者就導到 `/login?denied=1` 並顯示「沒有後台權限」 |

**指定管理者**只能在主機上執行，API 不提供修改角色的功能。`PATCH /v1/me` 不接受 `role`，有測試保護：

```bash
cd ~/apps/mou-welfare-v2/apps/api
./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/set-role.ts <email> admin   # 設為管理者
./node_modules/.bin/tsx --env-file=$HOME/.config/mou-welfare/api.env scripts/set-role.ts <email> user    # 取消
```

- 帳號要先在網站註冊。Email 未驗證時腳本會提醒，因為驗證前無法使用後台。
- 角色改變後，已登入的 session 下一次請求就會套用，不需要重新登入。
- 目前的管理者：cherites0610@gmail.com（2026-11-23 設定）。

---

## 4. 頁面與 API

| 頁面 | 路徑 | API | 內容 |
|---|---|---|---|
| 總覽 | `/` | `GET /v1/admin/overview` | 見 §4.1 |
| 福利列表 | `/welfare` | `GET /v1/admin/welfare` | 篩選與列表，見 §4.2 |
| 福利詳情 | `/welfare/:id` | `GET`、`PATCH /v1/admin/welfare/:id`、`POST /v1/admin/welfare/:id/restructure` | 原文對照與人工判定，見 §4.3 |
| LLM 用量 | `/llm` | `GET /v1/admin/llm-usage?days=` | 見 §4.4 |
| 使用者 | `/users`、`/users/:id` | `GET /v1/admin/users`、`GET /v1/admin/users/:id` | 唯讀，見 §4.5 |
| 爬蟲 | `/scraper`、`/scraper/:runId` | `GET /v1/admin/scraper`、`GET /v1/admin/scraper/runs/:id` | 排程與各站狀態，見 §4.6 |
| 稽核紀錄 | `/audit` | `GET /v1/admin/audit` | 見 §5 |

API 定義在 `apps/api/src/features/admin/routes.ts`（爬蟲在 `features/scraper/routes.ts`），也有 OpenAPI 文件（`/openapi.json` 的 `admin` 標籤）。前端的型別寫在 `apps/admin/app/utils/types.ts`，改 API 時要一起改。

### 4.1 總覽

- **數字卡**：
  - 可搜尋、判為非福利（含人工修正筆數）、已截止。
  - 結構化錯誤（含規則版、未結構化筆數）。
  - LLM 累計費用與呼叫次數。
  - 使用者數（近 7、30 天新增）。
- **各縣市福利數量**：堆疊長條圖，依可搜尋、非福利、已截止、待處理區分。明細表附非福利比例，每個縣市都有「看非福利」連結，直接開啟該縣市的非福利清單。
- **LLM 每日用量**：近 30 天，以台北時間分日。長條是費用，折線是輸入與輸出 tokens。
- **額度暫停警示**：Gemini 額度不足而暫停時（backend.md §8.4.1）顯示暫停時間、最後探測時間與錯誤訊息。
- **其他**：
  - 使用者：總數、已驗證、訂閱通知、收藏、家庭。
  - 結構化版本：各模型與 prompt 版本產生的福利筆數。
  - 爬蟲來源：各站點的福利數與最後看到的時間、最後一次推送時間。

### 4.2 福利列表

- **篩選**：名稱、`program_key` 或 id 關鍵字；縣市、狀態、結構化方式（LLM／規則／未結構化）、是否已人工檢核、是否有結構化錯誤。
- 篩選條件和頁碼存在網址上，從詳情頁返回時會保留。
- 包含所有狀態（可搜尋、非福利、已截止、待結構化、已下架），依更新時間新到舊，每頁 30 筆。
- 標籤：`人工`（有人工判定）、`置頂`、`錯誤`。

### 4.3 福利詳情與人工判定

- **左邊：結構化結果**
  - 摘要、類別、必備身分、申請資格、補助內容、截止日、發布日。
  - 模型、prompt 版本、結構化時間、有沒有 embedding。
  - 開放資料的原始欄位。
- **右邊：原文**：Markdown 轉 HTML（不允許原始 HTML，避免 XSS）。附件可以展開看抽出的文字。
- **下面**：這筆福利的每次 LLM 呼叫（token、耗時、費用），以及修改紀錄。
- **連結**：原始網頁；可搜尋或已截止的福利另有前台頁面連結。

**操作**：

| 按鈕 | 效果 |
|---|---|
| 判為福利 | `status_override = 'active'`，狀態立刻變成可搜尋（已過截止日則為已截止）。這筆沒有 embedding 時（之前被判為非福利），自動排入一次重新結構化補上 embedding，搜尋才找得到 |
| 判為非福利 | `status_override = 'rejected'`，立刻從搜尋消失 |
| 取消人工判定 | 清除 `status_override`，排入重新結構化，交給 LLM 判斷 |
| 置頂／取消置頂 | 設定 `pinned_at`，搜尋結果排在最前面 |
| 重新結構化 | 排入一次 `force` 的結構化（內容沒變也重做），人工判定的狀態保留 |
| 檢核備註 | 存在 `review_note`。按判定按鈕時，有改過的備註會一起存 |

- 判定後**自動跳到下一筆**，順序是列表頁目前那一頁（存在 `sessionStorage`）。也可以用「上一筆／下一筆」。
- 每次判定都記下 `reviewed_by`、`reviewed_at`，並寫入稽核紀錄（含修改前的值）。
- 排入的重新結構化每次約 0.0024 美元，會記在 `llm_calls`。

**人工判定的規則**（`jobs/structure.ts`）：

- 有 `status_override` 時，之後的結構化，包括內容更新、全量重做、單筆重做，**都不會改變狀態**。只有截止日會讓 `active` 變成 `expired`。
- 判為福利的，即使 LLM 認為不是福利，也會產生 embedding。
- 已下架（`removed`）的福利不能修改（409）。

**檢核建議流程**：

1. 從總覽「各縣市明細」點某縣市的「看非福利」，或在列表篩選「狀態：非福利、人工檢核：未檢核」。
2. 點第一筆，對照右邊的原文判斷：只要是一般民眾或家庭可以申請或使用的補助、津貼、服務，就算福利。判斷原則和回測一致（backend.md §8.3.1）。
3. 按「判為福利」或「判為非福利」。不確定的先填備註、跳過。
4. 檢核的結果之後可以補進回測的評測集（`apps/api/eval/`），讓下一版 prompt 有依據。

### 4.4 LLM 用量

- 期間可選 7、30、90 天或一年。
- 數字卡：呼叫次數、失敗、輸入與輸出 tokens（輸出含思考）、預估費用。
- 每日費用依用途堆疊（結構化、embedding、額度探測、聊天）。
- 明細依日期、用途、模型彙總，含平均耗時。錯誤依類型彙總並附最近一則訊息。另列出花費最多的福利，點了開詳情。
- 費用依 `apps/api/src/lib/llm/pricing.ts` 估算，實際以 AI Studio 帳單為準。Embedding 的 API 不回報 token 數，所以沒有費用（全量約 0.07 美元）。
- 資料來源是 `llm_calls`（backend.md §8.3.2）。主機上的 `scripts/llm-usage.ts` 可以看到同樣的資料。

### 4.5 使用者（唯讀）

- **列表**：只有辨識用欄位：名稱、Email、是否驗證、登入方式（Email、Google、LINE）、角色、註冊時間。可以用 Email、名稱或 id 搜尋。**不寫稽核紀錄**。
- **詳情**：生日、性別、居住縣市、身分、訂閱通知、登入方式與綁定時間、收藏數、有效登入數與最近活動、所屬家庭（名稱、角色、人數、加入時間）。**每次開啟都寫一筆 `user.view` 稽核紀錄**，頁面上方也會提示。
- 不顯示密碼雜湊、OAuth token、session token 等敏感資料。

### 4.6 爬蟲

爬蟲每 3 天在主機上執行一次（docs/scraper.md §10.4），在開始、每站結束、全部結束時回報給 API（`POST /internal/scrape-runs`，HMAC），存在 `scrape_runs`。

- **提示列**：排程逾期（預定時間過了一天還沒開始）、最近一次中斷（執行中超過 4 小時沒有回報）、有站點不正常，三者擇一顯示。
- **數字卡**：最近一次的狀態與開始時間（排程／手動）、進度（已完成站數，執行中顯示正在跑的站）、下一次預定時間、最近一次的推送數（新增、更新、下架）。執行中每 30 秒自動更新。
- **各站最近一次的結果**：狀態（正常、數量異常、無法連線、程式錯誤；滑過看原因）、看到、新增、更新、下架、推送、隔離、錯誤數、資料庫中可搜尋／全部的福利數、最後一次正常的時間。點一列開那次執行並展開該站。
- **最近的執行**（30 次）：開始時間、狀態（執行中、正常、有異常、中斷）、方式、站點數、耗時與合計。點一列看詳情。
- **執行詳情**：各站一列，展開看抓取頁數、標題規則排除數、錯誤（前 50 筆）與隔離清單（前 100 筆，附原網址與原因）。不正常的站點預設展開。

站點狀態的意思（爬蟲端的健康檢查，docs/scraper.md §6.7）：

| 狀態 | 條件 | 影響 |
|---|---|---|
| 正常 | — | 推送新增與更新；完整執行時判定下架 |
| 數量異常（`degraded`） | 看到的數量不到上次正常時的一半，或隔離比例過高 | **不推送、不判定下架**，避免網站改版時把福利全部下架 |
| 無法連線（`blocked`） | 一筆都沒看到（逾時、403、Cloudflare 驗證頁） | 同上 |
| 程式錯誤（`failed`） | 這一站的程式丟出例外（設定錯誤、網站結構改變） | 同上；其他站照常執行 |

**通知**（寄到 `ALERT_EMAIL`，backend.md §8.4.2）：一次執行結束時有站點不正常、執行中斷、排程逾期。全部正常不寄信。

---

## 5. 稽核紀錄與個資

`admin_audit` 記錄管理者的每一個敏感操作：

| `action` | 時機 | `detail` |
|---|---|---|
| `user.view` | 開啟使用者詳情 | — |
| `welfare.update` | 人工判定、備註、置頂 | `before`（修改前的狀態、人工判定、備註、是否置頂）、`patch`、`requeued`（是否排入重新結構化） |
| `welfare.restructure` | 單筆重新結構化 | — |

- 每筆都記下管理者的 id 與 Email、時間、IP（`CF-Connecting-IP`，沒有時用 `X-Forwarded-For`）。
- `admin_id` 不設外鍵：管理者帳號刪除後紀錄仍保留。
- 後台的「稽核紀錄」頁可依對象（福利、使用者）篩選。福利詳情頁也會顯示該筆的修改紀錄。
- **使用原則**：個人資料只在處理客服與系統問題時查看。列表刻意不放生日與身分，就是為了讓每次查看個資都留下紀錄。

---

## 6. 資料模型

```
welfare_programs（新增欄位，0008_admin）
  status_override text      -- null | 'active' | 'rejected'；人工判定，結構化不覆蓋
  reviewed_by text          -- 判定的管理者 id
  reviewed_at timestamptz
  review_note text

admin_audit(id bigserial pk, at, admin_id, admin_email, action, target_type, target_id, detail jsonb, ip)
  index (at)、(target_type, target_id)

scrape_runs(id pk, trigger, status, interval_days, planned text[], current, sites jsonb,   -- 0009_scraper_runs
            started_at, finished_at, updated_at)
  -- id 是爬蟲的 run_id（YYYYMMDD-HHMMSS，臺北時間）；sites 是每站的結果（含前 50 筆錯誤、前 100 筆隔離）
alert_state(key pk, value, sent_at)   -- 系統通知的去重（backend.md §8.4.2）
```

`user.role`（`user` / `admin`）是原本就有的欄位。

---

## 7. 開發

```bash
# API 的 .env：TRUSTED_ORIGINS 要包含 http://localhost:3001
pnpm dev:api                      # http://localhost:5031
pnpm dev:admin                    # http://localhost:3001
cd apps/api && ./node_modules/.bin/tsx --env-file=.env scripts/set-role.ts <本機帳號 email> admin
```

- **型別檢查**：`pnpm --filter @mou-welfare/admin typecheck`。Element Plus 表格的 row 型別是 `DefaultRow`，在 template 內傳給函式時，參數要宣告成 `Record<string, …>`。
- **API 測試**：`apps/api/tests/admin.test.ts`，涵蓋：
  - 權限：未登入、一般使用者、未驗證管理者、無法自行升級。
  - 人工判定：不被結構化覆蓋、補 embedding、截止日、取消判定。
  - 列表篩選、置頂與重新結構化的稽核。
  - 使用者列表不含個資、詳情寫入稽核。
  - 總覽與用量的統計。
- **畫面確認**：2026-11-23 以 Playwright 在本機走過登入、總覽、篩選、判定並跳下一筆、LLM 用量、使用者詳情、稽核紀錄，沒有 console 錯誤。正式環境確認過未登入會導向登入頁、呼叫正式 API。

---

## 8. 部署

- GitHub Actions `deploy.yml` 的 `admin` 工作在 CI 通過後執行：
  1. 安裝 `@mou-welfare/admin` 的相依套件。
  2. 建置，`NUXT_PUBLIC_API_BASE=https://api.mou-welfare.com`、`NUXT_PUBLIC_WEB_BASE=https://mou-welfare.com`。
  3. `wrangler deploy`。

  使用和前台相同的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
- 部署後的煙霧測試確認 `https://admin.mou-welfare.com/login` 回 200（跟隨 307 轉址）。
- 手動部署：

  ```bash
  NUXT_PUBLIC_API_BASE=https://api.mou-welfare.com NUXT_PUBLIC_WEB_BASE=https://mou-welfare.com pnpm --filter @mou-welfare/admin build
  pnpm --filter @mou-welfare/admin run deploy
  ```

- **v1 切換到 v2**（backend.md §10.3）：✅ 2026-11-24 完成。API 網域為 `api.mou-welfare.com`、前台為 `mou-welfare.com`，CI 的 `NUXT_PUBLIC_API_BASE`、`NUXT_PUBLIC_WEB_BASE` 已一起改；`TRUSTED_ORIGINS` 包含 `https://admin.mou-welfare.com`。

---

## 9. 之後可以做的

- [ ] 檢核被判為非福利的資料（2026-11-23 全量後 455 筆，2026-11-25 為 459 筆；從屏東縣 191 筆開始）。
- [ ] 把人工判定的結果匯出成評測集的補充案例。
- [ ] 福利結構化欄位的人工修正（目前只能改狀態），需要先設計「人工修正的欄位不被結構化覆蓋」。
- [ ] 批次操作（一次判定多筆）。
- [ ] 在後台手動觸發爬蟲（目前要在主機上執行 `ops/scrape-scheduled.sh --now`）。
- [ ] 管理者登入加上第二道驗證（例如 Better Auth 的 two-factor plugin），或限制來源 IP。
