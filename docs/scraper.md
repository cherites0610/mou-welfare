# 爬蟲設計文件（v2）

> 狀態：P0 原型完成，13 個來源（12 縣市、1,471 筆）已推送到正式環境，後端已用 Gemini 結構化完成（可搜尋 985 筆）；尚未排程，見第 10 節
> 最後更新：2026-11-23（hash 忽略下載次數計數器；後端結構化結果）
> 範圍：22 縣市社會福利資料蒐集，從抓取到推送給後端

---

## 1. 背景：v1 的三個痛點

v1 程式碼保存在 `v1-api` tag 的 `scraper/` 目錄。

| 痛點 | v1 的實際狀況 |
|---|---|
| **每個縣市都要從頭寫** | 寫死「根目錄 → 子目錄 → 列表 → 內文」四層爬法，每站要 6–8 個 CSS selector。<br>`BaseScraper` 寫了但沒人用，兩支爬蟲各自複製程式碼。<br>22 縣市只完成 2 支，桃園那支還被註解掉。 |
| **改版就壞** | selector 抓不到時回傳空字串，照樣推給後端，沒有任何警告。<br>列表頁沒處理分頁，只抓到第一頁。 |
| **去雜訊做不好** | 從社會處網站的根目錄往下爬，會議紀錄、採購、活動、對團體的補助公告全部進入 LLM。<br>`clean_text` 刪掉所有換行，表格和條列在交給 LLM 前就被壓成一行。 |

v1 的其他問題：
- 沒有排程。
- 只用網址去重，公告內容更新了也不會同步，下架也不知道。
- PDF 只讀前 5 頁，不支援 `.doc`、`.xls`、`.ods`。
- `requirements.txt` 是整台機器的 `pip freeze`，含 tensorflow 等無關套件。

---

## 2. 決策摘要

1. **不做「AI 爬蟲」。**
   - 政府網站多為結構化的列表和表格，日常爬取用固定規則，結果可重現、成本低。
   - AI 只用在三個地方：
     - **產生站點設定**：每站一次。
     - **改版後修復設定**：很少發生。
     - **判斷新公告是不是福利**：每日少量。
2. **資料來源分三級**，優先使用越結構化的來源：
   - 開放資料 API
   - 縣市的福利查詢平台
   - 社會局（處）網站
3. **內容抽取完全通用**：用 trafilatura 抽正文並保留結構，不寫任何內文 selector。
4. **站點差異集中在 YAML 設定**：同一個網站系統的縣市共用一個 adapter。調查發現 22 縣市中有 11 個用同一套系統（見第 4 節）。
5. **用狀態表偵測新增、更新、下架**，只推送有變動的公告。
6. **去雜訊分三層**：
   - 只爬福利專區
   - 標題規則
   - LLM 分類
   
   另外合併跨年度的同一個福利。
7. **品質關卡與健康檢查**：資料不合格就不推送；數量異常下降視為改版，自動暫停該站並警告。
8. **必須從台灣 IP 執行**：建議 GCP `asia-east1`（彰化）。從海外連線時，6 個社會局（處）網站和多數縣市福利平台都逾時（見第 4.2 節）。
9. **繼續使用 Python**：文件解析（PDF、ODT、DOCX）的套件比 Node 成熟。依賴用 uv 管理。

---

## 3. 整體架構

```
                 ┌───────────── sources ─────────────┐
 sites/*.yaml →  │ L1 opendata   L2 portal   L3 cms   │  ← 每種來源一個 adapter
                 └──────────────┬────────────────────┘
                                │  RawItem(url, title?, html|fields, attachments[])
                                ▼
                 ┌──────── extract（通用）────────┐
                 │ trafilatura → Markdown（保留表格/條列）
                 │ 標題/日期：meta → h1 → 規則 → LLM 補
                 │ 附件：依實際內容類型解析，掃描 PDF 交給 Gemini 讀
                 └──────────────┬─────────────────┘
                                ▼
                 ┌──────── state（SQLite/Postgres）────────┐
                 │ content_hash 比對 → NEW / UPDATED / UNCHANGED / REMOVED
                 └──────────────┬─────────────────┘
                                ▼ （只處理 NEW / UPDATED）
                 ┌──────── filter ────────┐
                 │ L1 範圍（設定只含福利專區）
                 │ L2 標題規則（排除 / 加分）
                 │ L3 LLM 分類（結構化輸出，結果快取）
                 └──────────────┬─────────┘
                                ▼
                 ┌──────── quality gate ────────┐   不合格 → 隔離區 + 警告
                 └──────────────┬───────────────┘
                                ▼
                 POST /internal/ingest（upsert）、POST /internal/remove
                                ▼
                 run report：每站數量、與上次的差異、失敗清單 → 異常就警告
```

---

## 4. 22 縣市資料來源調查

調查方式：2026-11-18，從東京的機器直接連線測試，搭配限定網域的搜尋，以及政府資料開放平臺的資料集頁面。

**連線欄的符號**
- ✅ 可直接連線
- ⏱ 從海外連線逾時（推測封鎖海外 IP）
- 🛡 防爬機制（Cloudflare 或 WAF）
- 🔍 只透過搜尋確認網址，未實際連線

**網站系統分族**
- **A 族**：網址為 `cp.aspx` / `cl.aspx` / `News.aspx?n=&sms=` / `News_Content.aspx?n=&s=` / `Content_List.aspx?n=`，參數 `n` 可能是數字或 16 碼 hex。
- **B 族**：網址為 `home.jsp?id=…&dataserno=…&mserno=…`。
- **C 族**：各縣市自建的系統。

| # | 縣市 | 主管機關 | 社福網站 | 族 | 福利入口（爬取起點） | 結構化來源（L1 / L2） | 連線 | 建議策略 |
|---|---|---|---|---|---|---|---|---|
| 1 | 臺北市 | 社會局 | dosw.gov.taipei | A（hex） | `Content_List.aspx?n=09B2CDA681C47C09`（社會救助）、`n=EA0CF8DD1014E232`（身障經濟補助）、`n=2C486AA08208CD74`（育兒補助）等 | 開放資料 121369、121552 是統計資料，不是福利清單 | ✅ | L3 A 族 |
| 2 | 新北市 | 社會局 | www.sw.ntpc.gov.tw | B | `home.jsp?id=…`（需整理各福利專區 id） | 「福利補助自己查」（約 2013 年建置，現況待查） | ✅ | L3 B 族 |
| 3 | 桃園市 | 社會局 | sab.tycg.gov.tw | A（數字） | `cl.aspx?n=7313` 福利服務；身障 7322、兒少 7343、救助 7354、老人 7370 | **開放資料 [26032](https://data.gov.tw/dataset/26032)**：有 API、欄位完整，但只有 26 筆，混了勞動局、漁業的補助；另有 [26017](https://data.gov.tw/en/datasets/26017)；線上申辦目錄 e-services.tycg.gov.tw | ✅ | **L1 + L3**：開放資料補充，主體仍爬網站 |
| 4 | 臺中市 | 社會局 | www.society.taichung.gov.tw | C（路徑式 `/13710/…/{id}`、`/{id}/post`） | `/13710/13735/13774/13783`（老人福利）等 | **開放資料：[112089](https://data.gov.tw/en/datasets/112089) 身障、[112090](https://data.gov.tw/en/datasets/112090) 長青、[132989](https://data.gov.tw/en/datasets/132989) 婦女福利補助項目**（2026 年有更新） | ⏱ | **L1 優先**，不足的再用 L3 自建 adapter |
| 5 | 臺南市 | 社會局 | sab.tainan.gov.tw | A（數字） | 各科福利頁（待整理）。注意：`cl.aspx?n=34781`「補助業務公告專區」是對團體的補助，屬於雜訊 | 開放資料 [79613](https://data.gov.tw/dataset/79613)「社會福利項目」：有年齡、設籍、身份等欄位，2025-06 更新 | ✅ | **L1 + L3 A 族** |
| 6 | 高雄市 | 社會局 | socbu.kcg.gov.tw | C（`index.php?prog=&b_id=&m_id=&s_id=`） | `b_id`：3 婦女、4 老人、5 身障、6 救助、7 單親、25 托育 | — | ⏱🔍 | L3 自建 adapter |
| 7 | 基隆市 | 社會處 | www.klcg.gov.tw/tw/social | C（`/tw/social/{n}.html`） | `2748.html` 社會福利專區；`2694` 老人、`2696` 身障、`2697` 救助 | — | ✅ | L3 自建 adapter（沿用 v1 經驗） |
| 8 | 新竹市 | 社會處 | society.hccg.gov.tw | B | `home.jsp?id=73`（社會福利）、經濟補助 `id=127`… | — | 🛡 Cloudflare | L3 B 族；需確認從台灣 IP 是否還會被擋 |
| 9 | 嘉義市 | 社會處 | social.chiayi.gov.tw | A（數字） | 老人 `News.aspx?n=1101&sms=9555`、身障 `n=393`、救助 `n=397`、兒少 `n=401`、婦女 `n=403` | — | ✅ | L3 A 族 |
| 10 | 新竹縣 | 社會處 | social.hsinchu.gov.tw | A（數字） | 老人 `News.aspx?n=205&sms=8667`、身障 `n=206&sms=8668` | — | ⏱🔍 | L3 A 族 |
| 11 | 苗栗縣 | 社會處 | www.miaoli.gov.tw/social_affairs | A（數字，縣府主站的子站） | 補助資訊 `News.aspx?n=8637&sms=14225`、社福資源 `n=693` | — | ✅ | L3 A 族 |
| 12 | 彰化縣 | 社會處 | social.chcg.gov.tw | C（`07other/other01_list.aspx?topsn=`） | 津貼及補助專區 `main.aspx?main_id=2`；長青 `topsn=711`、救助 `topsn=714` | **福利小幫手 lac.chcg.gov.tw/lachelper**（查詢平台，⏱） | ✅（舊路徑 www.chcg.gov.tw/DTO/social 會被 WAF 擋） | L2 優先，不足的再用 L3 |
| 13 | 南投縣 | 社會及勞動局 | welfare.nantou.gov.tw | C（`/1486/…`） | 社會福利資訊網（獨立站） | 本身就是福利資訊網 | ✅ | L2/L3 自建 adapter |
| 14 | 雲林縣 | 社會處 | social.yunlin.gov.tw | A（數字） | `News.aspx?n=9454&sms=16138` 社會福利資源 | **智慧福利資訊網 welfare.yunlin.gov.tw/People/Search** | 🛡 Cloudflare（social）、⏱（welfare） | **L2 優先**，社福網站有 Cloudflare |
| 15 | 嘉義縣 | 社會局 | sabcc.cyhg.gov.tw | A（hex） | 各科 `cp.aspx?n=…`、`News_Content.aspx?n=67653A9290173E79…`（老人） | — | ⏱🔍 | L3 A 族 |
| 16 | 屏東縣 | 社會處 | www.pthg.gov.tw/planjdp | A（hex） | **社會福利總覽 `Content_List.aspx?n=46F6EFDFE943D834`**；婦女、老人、兒少、身障、救助各有 Content_List | 社會福利e點靈 socmap.pthg.gov.tw/pt1w | ✅（e點靈 ⏱） | L3 A 族 |
| 17 | 宜蘭縣 | 社會處 | sntroot.e-land.gov.tw | A（數字） | 服務項目 `cl.aspx?n=10099`；救助 `News.aspx?n=11278`、身障 `n=11280` | — | ✅ | L3 A 族 |
| 18 | 花蓮縣 | 社會處 | sa.hl.gov.tw | C（`List_sp/{guid}`、`Detail_sp/{guid}`） | 老人、身障、救助、兒少、婦女各有 `List_sp` | 福利地圖 welfare.hl.gov.tw（⏱） | ✅ | L3 自建 adapter |
| 19 | 臺東縣 | 社會處 | taisoc.taitung.gov.tw | C（`WebSite/…aspx?menuid=`） | 待整理 | ttcd.taitung.gov.tw、育兒專站 ttbaby.taitung.gov.tw | ⏱（ttcd ✅） | L3 自建 adapter |
| 20 | 澎湖縣 | 社會處 | www.penghu.gov.tw/society | B | 經濟補助 `home.jsp?id=169` | 線上申辦福利專區 eservice.penghu.gov.tw | ⏱🔍 | L3 B 族 |
| 21 | 金門縣 | 社會處 | social.kinmen.gov.tw | A（hex） | **主題福利服務專區 `Content_List.aspx?n=B709941748334ACA`**；兒少、婦女、老人、身障、救助、新住民各有專區 | **智慧福利服務躍升平台 action.kinmen.gov.tw/people** | ✅ | L2 + L3 A 族 |
| 22 | 連江縣 | 衛生福利局 | www.matsu.gov.tw/chhtml/…/371043600I | C | 身障 `texthtml/content/371030000A0001/5974`、兒少 `chhtml/news/371043600I/2483` | 縣民服務中心 eservice.matsu.gov.tw | ✅（回應不穩定） | L3 自建 adapter |

### 4.1 網站系統分族統計

| 族 | 縣市 | 數量 | 意義 |
|---|---|---|---|
| **A 族** | 臺北、桃園、臺南、嘉義市、新竹縣、苗栗、雲林、嘉義縣、屏東、宜蘭、金門 | **11** | 寫一個 adapter 就涵蓋一半的縣市，各站只差在起點網址 |
| **B 族** | 新北、新竹市、澎湖 | 3 | 第二個 adapter |
| **C 族** | 臺中、高雄、基隆、彰化、南投、花蓮、臺東、連江 | 8 | 各自寫小型 adapter。臺中優先用開放資料，彰化、南投優先用福利平台 |

> A 族裡有 8 站實際連線確認過，新竹縣、雲林、嘉義縣 3 站只有從搜尋結果的網址判斷。實作前要在台灣 IP 上逐站驗證。

### 4.2 防爬與連線限制

| 類型 | 縣市 | 對策 |
|---|---|---|
| 封鎖海外 IP（推測） | 社會局（處）網站：臺中、高雄、新竹縣、嘉義縣、臺東、澎湖。福利平台：雲林、花蓮、彰化福利小幫手、屏東e點靈、臺中 societydata、澎湖線上申辦 | 在台灣 IP 上執行（GCP `asia-east1`） |
| Cloudflare 驗證頁 | 雲林社會處、新竹市社會處 | 先從台灣 IP 驗證；仍被擋就改用 L2 平台或開放資料。必要時用無頭瀏覽器並大幅降低頻率。**不嘗試破解驗證機制** |
| WAF（Request Rejected） | 彰化舊路徑 `www.chcg.gov.tw/DTO/social` | 改用新網域 social.chcg.gov.tw |

**禮貌爬取規則（所有站都適用）**
- 每站同時只開 1 個連線，每次請求間隔 ≥ 2 秒。
- 遵守 `robots.txt`。
- User-Agent 寫明身分和聯絡方式，例如 `MouWelfareBot/2.0 (+https://mou-welfare.com/bot)`。
- 只在夜間執行。

---

## 5. 執行環境

- **地點**：必須是台灣 IP。從東京測試時，有 6 個社會局（處）網站逾時：臺中、高雄、新竹縣、嘉義縣、臺東、澎湖；另有 6 個福利平台逾時：雲林、花蓮、彰化、屏東、臺中、澎湖。
- **建議**：GCP Cloud Run Jobs 放在 `asia-east1`，由 Cloud Scheduler 每天凌晨觸發；各站平行，站內依序。
- **替代方案**：台灣的 VPS，或在後端主機上用 cron 執行。
- **目前**（2026-11-23）：在東京的後端主機上以 crontab 執行，每 3 天一次（§10.4），只能爬得到 12 縣市。台灣 IP 的環境之後再加。
- **執行模式**：
  - 每日增量：抓列表頁，只對新增或變動的網址抓內文。
  - 每週全量：重新檢查所有已知網址，偵測下架。

---

## 6. 模組設計

### 6.1 站點設定（`sites/*.yaml`）

```yaml
# sites/kinmen.yaml
id: kinmen
city: 金門縣
adapter: cms_a              # cms_a | cms_b | opendata | portal | custom:<name>
base_url: https://social.kinmen.gov.tw
seeds:                      # 只放福利專區，不放「最新消息」
  - url: /Content_List.aspx?n=B709941748334ACA
    label: 主題福利服務專區
  - url: /Content_List.aspx?n=315869EEDF0D4401
    label: 老人福利專區
follow: 'Content_List\.aspx\?n=[0-9A-F]{16}'   # 列表之間可往下走的連結
detail: '(cp|News_Content)\.aspx\?n=[0-9A-F]{16}(&s=[0-9A-F]{16})?'
pagination: { param: page, max: 20 }
exclude_title: []           # 該站特有的雜訊關鍵字，會疊加全域規則
expect:                     # 健康檢查基準，第一次成功執行後自動寫入
  min_items: 40
generated_by: llm@2026-11-20  # 留紀錄：由 AI 產生，經人工確認
```

- **`cms_a` / `cms_b` adapter**：了解該族網站共通的列表、分頁、附件區塊格式。設定只需提供起點網址，`follow` 和 `detail` 有預設值。
- **`opendata` adapter**：欄位對應寫在設定裡，例如 `policyName → title`、`eligibilityCriteria → requirements`。
- **`custom:<name>`**：給 C 族使用，寫成小型 Python 類別，只實作「列出內文網址」這一個方法；抽取仍走通用流程。

### 6.2 AI 產生設定與自動修復

```
scrape init --city 屏東縣 --url https://www.pthg.gov.tw/planjdp/
  1. 抓首頁和導航，LLM 挑出福利相關的入口連結（排除最新消息、會議、採購）
  2. 判斷網站屬於哪一族；A 或 B 族直接套範本，C 族由 LLM 提出連結規則
  3. 試跑：抓 ≥ 20 篇內文，檢查品質關卡的通過率
  4. 產生報告：入口清單、範例標題、通過率 → 人工確認後寫入 sites/pthg.yaml
```

```
健康檢查失敗（數量 < 上次的 50%、或品質通過率 < 70%）
  → 該站本次結果不推送，狀態標為 degraded，發出警告
  → 自動執行 init 流程重新產生設定 → 產生差異報告 → 等人工確認
```

### 6.3 通用抽取

- **正文**：trafilatura 輸出 Markdown，保留表格和條列，不再壓成一行。抓到的正文太短時，退回抓 `<main>`、`<article>` 或最大的文字區塊。
- **標題**：依序嘗試 `og:title` → `<h1>` → `<title>`，再去掉網站名稱的前後綴。
- **日期**：先用規則找「發布日期、更新日期、民國年」，找不到再交給 LLM 補。
- **附件**：抓頁面上所有檔案連結，依實際的檔案類型判斷格式（不看副檔名）。

| 格式 | 解析方式 |
|---|---|
| PDF（文字） | pypdf，或 pdfplumber（表格多時）；不限頁數，總字數超過 30k 才截斷 |
| PDF（掃描） | 抽不到文字時交給 Gemini 讀 |
| DOCX | python-docx，含表格 |
| ODT | odfpy |
| DOC、XLS、ODS | 先用 LibreOffice headless 轉檔再解析；容器內內建 |

### 6.4 狀態表

```sql
CREATE TABLE pages (
  url           TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL,
  title         TEXT,
  content_hash  TEXT,            -- 正文和附件文字正規化後的 sha256
  status        TEXT,            -- active | removed | filtered | quarantined
  label         TEXT,            -- LLM 分類結果（快取）
  first_seen    TIMESTAMP,
  last_seen     TIMESTAMP,
  last_changed  TIMESTAMP,
  pushed_hash   TEXT             -- 最後一次成功推送給後端的 hash
);
```

- **新增**：狀態表裡沒有這個網址。
- **更新**：這次的 hash 和上次「處理完」時記下的 `content_hash` 不同。推送、過濾、隔離都算處理完；推送失敗則不更新，下次重試。
- **下架**：完整執行（沒有 `--limit`）且健康檢查正常時，連續 2 次沒看到。只有推送過的網址會通知後端。
- **hash 的範圍**：正文（去掉每次瀏覽都會變的計數器）加上附件網址。附件內容不列入，因此沒變動的頁面不必每次重新下載附件。
  - 計數器：`normalize.py` 的 `_VOLATILE_RE`，目前處理「下載 N 次」「瀏覽人次：N」「點閱數：N」「人氣：N」。2026-11-23 發現基隆市 54 頁的附件旁有「下載781次」，不去掉的話每次爬取 hash 都不同，後端就會每次重新交給 LLM（每次約 0.13 美元）。改動 hash 規則後，含計數器的頁面下次爬取時 hash 會變一次（重新結構化一次），之後就穩定。
  - 臺北市 116 頁有「資料檢視：115-11-13 20:07」時間戳，看起來只在承辦人更新時才變，先不處理；新增網站時要檢查有沒有類似的欄位。
- 實作時另外加了 `last_run`、`miss_count`（下架判定）與 `runs` 表（每站每次看到的數量，作為健康檢查的基準）。

### 6.5 去雜訊（三層過濾）

**L1：範圍**
設定只放福利專區，不從「最新消息」或社會處的根目錄開始。這是效果最大的一層。

**L2：標題規則**（全域規則加上各站的規則）
- **直接排除**：會議紀錄、會議記錄、開會通知、招標、採購、決標、徵才、甄選、新聞稿、活動花絮、成果、志工、評鑑、徵選補助單位、補助民間團體、核銷、公開徵信、統計、預算、決算。
- **加分**：補助、津貼、給付、救助、減免、申請、資格、費用補助、生活扶助。

**L3：LLM 分類**
用便宜的模型（例如 Gemini Flash 等級），以結構化輸出回傳以下格式。結果寫進 `pages.label`，同一份內容不重複判斷。

```json
{
  "type": "program | announcement | minutes | procurement | org_grant | event | statistics | other",
  "is_individual_welfare": true,
  "program_name": "中低收入老人生活津貼",
  "year": 115,
  "confidence": 0.92,
  "reason": "說明個人申請資格與每月補助金額"
}
```

- 只有 `type=program` 且 `is_individual_welfare=true` 的公告才往下走。
- `org_grant`（對團體、機構的補助）要另外列為一類。臺南「補助業務公告專區」、花蓮「徵選補助單位」都是這種，標題看起來很像福利，最容易誤判。
- `confidence < 0.6` 的放入人工複核清單。

**跨年度合併**：把 `program_name` 正規化（去掉年度、縣市名），再加上 `site_id` 當作合併鍵，同一福利的新年度版本會更新舊紀錄，而不是新增一筆。後端用 `program_key` 做 upsert（見第 7 節）。

**驗證集**：人工標註約 200 篇，橫跨 A、B、C 三族各 2 站，作為調整規則和 prompt 的依據。目標是準確率 ≥ 95%、召回率 ≥ 90%。

### 6.6 品質關卡

以下任一條件成立，該筆就不推送，放入隔離區：
- 標題空白，或少於 4 個字。
- 正文加附件少於 80 個字。
- 正文和其他網址的內容重複度 > 95%（例如網站錯誤頁、共用的「查無資料」頁）。
- 日期解析出未來超過 1 年的日期。

### 6.7 執行報告

每次執行產生 `reports/{run_id}.json` 和一份 Markdown 摘要。以 `--push` 執行時，另外在開始、每站結束、全部結束時回報給 API（`POST /internal/scrape-runs`），在管理後台的「爬蟲」頁查看（`docs/admin.md` §4.6）；有站點不正常時由 API 寄信到 `ALERT_EMAIL`（`docs/backend.md` §8.4.2）。一站整個失敗（程式丟出例外）時記為 `failed`，其他站照常執行。

```
site     seen  new  upd  removed  filtered  quarantined  pushed  health
kinmen     58    2    1        0        37            0       3  ok
hccg        0    0    0        0         0            0       0  BLOCKED (403 cloudflare)
pthg       12    0    0        0         4            1       0  DEGRADED (seen 12 < 50% of 61)
```

---

## 7. 與後端的介面

v1 只有 `POST /welfare/ingest`，用 `sourceUrl` 去重，存在就跳過。v2 改為（2026-11-19 實作，`apps/api/src/features/ingest/`）：

| 端點 | 用途 |
|---|---|
| `POST /internal/ingest` | upsert，鍵為 `program_key`（沒有就用 `source_url`）；`content_hash` 不同才重新交給 LLM 結構化 |
| `POST /internal/remove` | 標記下架（軟刪除，保留紀錄）。內容：`{ "site_id": "kinmen", "urls": ["..."] }` |
| 驗證 | HMAC 簽章加時間戳；金鑰未設定時一律拒絕（v1 在沒設 `API_KEY` 時可被繞過） |

**簽章**（`services/scraper/src/scraper/push.py`，後端依同樣規則驗證）：

```
X-Mou-Timestamp: 1700000000                       # unix 秒
X-Mou-Signature: sha256=<hex>                     # HMAC-SHA256(INGEST_HMAC_KEY, "{timestamp}.{原始 body}")
```

後端用原始 body 計算、以常數時間比較，時間戳與伺服器時間相差超過 5 分鐘就拒絕（防重放）。

推送格式由 `packages/shared` 的 Zod schema 產出 JSON Schema，爬蟲端用 pydantic 依同一份 schema 驗證：

```json
{
  "source": { "site_id": "kinmen", "city": "金門縣", "url": "...", "kind": "cms|opendata|portal" },
  "program_key": "kinmen:中低收入老人生活津貼",
  "title": "...",
  "published_at": "2026-03-01",
  "content_md": "...（正文 Markdown）",
  "attachments": [{ "name": "申請表.pdf", "url": "...", "text": "..." }],
  "structured": { },
  "classification": { "type": "program", "confidence": 0.92 },
  "content_hash": "sha256:..."
}
```

`structured` 欄位放開放資料原本就有的結構化欄位，例如資格、應備文件。後端可以直接使用這些欄位，或交給 LLM 補齊。

---

## 8. 技術選型

| 用途 | 選擇 |
|---|---|
| 語言與依賴 | Python 3.12、**uv**（`pyproject.toml`，只列真正用到的套件） |
| HTTP | httpx（同一個 client 重複使用、重試、每站限速） |
| HTML 解析 | selectolax（快）或 BeautifulSoup |
| 正文抽取 | trafilatura |
| 文件解析 | pypdf、pdfplumber、python-docx、odfpy、LibreOffice headless |
| LLM | Gemini（Flash 等級做分類，視覺模型讀掃描 PDF）；結構化輸出 |
| 狀態 | 本機開發用 SQLite；正式環境用後端的 Postgres，獨立 schema `scraper` |
| CLI | Typer：`scrape run [--site X] [--dry-run]`、`scrape init`、`scrape report` |
| 測試 | pytest，搭配存成檔案的 HTML 快照，可離線執行 |
| 不採用 | Scrapy（對這個規模太重）、Crawl4AI（功能重疊；之後 C 族站點太多再評估）、Playwright（只在 Cloudflare 站點確認必要時才引入） |

---

## 9. 目錄結構

```
services/scraper/
├── pyproject.toml
├── sites/                  # 站點設定（YAML），一站一檔
│   ├── kinmen.yaml         # A 族
│   ├── ntpc.yaml           # B 族
│   ├── klcg.yaml           # C 族
│   └── taichung.yaml       # 開放資料
├── src/scraper/
│   ├── cli.py              # scrape sites / scrape run
│   ├── fetch.py            # 共用 HTTP client：限速、robots.txt、重試、大小上限
│   ├── adapters/
│   │   ├── base.py         # Adapter 介面：list_items() -> Iterator[RawItem]
│   │   ├── crawl.py        # 列表 → 內文的通用爬法；CmsA、CmsB 只是預設值不同
│   │   ├── opendata.py
│   │   └── custom/         # C 族：klcg.py …（多數只需要覆寫預設值）
│   ├── extract/            # html.py（trafilatura、標題、附件連結）、dates.py、files.py（附件解析）
│   ├── filter/             # rules.py、classify.py（LLM，P1）
│   ├── normalize.py        # program_key、content_hash
│   ├── state.py
│   ├── quality.py
│   ├── pipeline.py         # 單站流程與健康檢查
│   ├── push.py             # 推送到後端（HMAC 簽章）
│   ├── report.py
│   └── initgen.py          # AI 產生設定與修復設定（P2）
└── tests/
    ├── fixtures/{site}/*   # 存成檔案的網頁快照，測試不連網路
    └── test_*.py
```

---

## 10. 推進計畫

| 階段 | 內容 | 完成標準 |
|---|---|---|
| **P0 原型** | 3 站各代表一族：**金門（A）、新北（B）、基隆（C）**；再加臺中開放資料（L1）。只做抓取、抽取、狀態、規則過濾，不做 AI 產生設定 | 3 站都能穩定跑完；人工檢查 50 篇，抽取品質可接受 |
| **P1 去雜訊** | LLM 分類加上 200 篇驗證集 | 準確率 ≥ 95%、召回率 ≥ 90% |
| **P2 A 族擴展** | 其餘 10 個 A 族縣市（用 `scrape init` 產生設定） | 11 站上線；記錄 AI 產生設定第一次就成功的比例 |
| **P3 部署** | 排程、執行報告與警告（後端 ingest upsert 已在 2026-11-19 完成） | 2026-11-23 先在東京主機以 crontab 每 3 天執行，回報到管理後台（§10.4）；台灣 IP 的環境（Cloud Run Jobs `asia-east1` 或台灣 VPS）待定 |
| **P4 B、C 族與平台** | 新竹市、澎湖（B）；高雄、彰化、南投、花蓮、臺東、連江（C）；雲林、彰化 L2 平台 | 22 縣市全數上線 |
| **P5 自動修復** | 健康檢查觸發重新產生設定 | 模擬改版能被偵測並產生修復建議 |

### 10.1 P0 實作紀錄（2026-11-19）

從東京主機實際跑完 4 個來源（臺中社會局網站封鎖海外 IP，改用開放資料；其他 3 站可以直接連）。數量見下表，抽查清單由 `scrape sample` 產生。

| 站點 | 族 | 看到 | 標題規則排除 | 隔離 | 可推送 | 有附件 | 執行時間 |
|---|---|---|---|---|---|---|---|
| 金門 `kinmen` | A | 148 | 0 | 4（正文空白） | 144 | 95 | 約 15 分鐘 |
| 新北 `ntpc` | B | 182 | 15 | 0 | 167 | 102 | 約 40 分鐘 |
| 基隆 `klcg` | C | 141 | 8 | 1 | 132 | 96 | 約 20 分鐘 |
| 臺中 `taichung` | 開放資料 | 34 | 0 | 0 | 34 | — | 數秒 |

- 合計 477 筆可推送；同一站內 `program_key` 重複的有 14 組（同一福利出現在多個分類），由後端合併。
- 第二次執行（臺中）34 筆全部判定為沒變，不推送。
- 每站都在禮貌爬取規則內（同一主機間隔 2 秒），各站可以平行執行。新北多數公告附多個 PDF，是最慢的一站。
- 抽查 52 篇（各站 13 篇）：標題、正文、日期、附件文字大致正確；不是個人福利的項目（宣導影片、繪本、機構管理、定型化契約）約佔 1/5，留給 P1 的 LLM 分類。

**實際跑出來、已經處理的問題**

| 問題 | 站點 | 處理方式 |
|---|---|---|
| 每天都會變的欄位（點閱次數、最後更新時間）讓 hash 每天不同 | 基隆、新北 | 抽取後先刪除這些行再算 hash（`extract/html.py` `_VOLATILE_LINE`） |
| 網站在負載高時對正常網址回傳 200 的「找不到網頁」頁面（soft 404），而且是間歇性的 | 金門 | 品質關卡新增 `error_page`；被隔離的頁面下次 hash 不同會自動重新處理 |
| 正文區塊是空的時，trafilatura 退回整頁文字，把選單當正文 | 金門 | 輸出的行大多是頁面上的連結文字時視為失敗，改用正文區塊（`content` selector）；仍不足 80 字就隔離，有附件則併入附件文字 |
| 列表預設每頁 10 筆，只抓到第 1 頁 | 基隆 | GET `nowPage` / `pageSize=40` 分頁；帶額外參數時從第 1 頁重抓 |
| 項目直接連到另一個主機（市府線上申辦網站），內容反而最完整 | 新北 | 站點設定 `extra_hosts`：其他主機只收內文頁，不往下走列表 |
| A 族的 `cp.aspx?n=X` 顯示第一個子項目，同時列出 `&s=` 子項目，會重複 | 金門 | `CmsA.is_hub()`：有子項目的目錄頁不輸出 |
| 附件在頁尾區塊，不在內容區塊 | 金門 | A 族的 `body` 加上 `div.file-download-multiple` |
| 只有內容在附件裡的公告 | 新北 | 正文不足 80 字時把附件文字併入正文 |

**還沒處理（後續階段）**

- 托嬰中心、機構名冊、調查報告、捐款明細這類「不是個人可申請的福利」，標題規則只能擋一部分，交給 P1 的 LLM 分類。
- 同一個福利在不同分類各有一頁（例如金門「申請社會救助專戶」出現在老人、身障、社會救助三個分類），`program_key` 相同，由後端 upsert 合併。
- 舊格式附件（DOC、XLS）與掃描 PDF 目前沒有文字（LibreOffice、Gemini 在之後加入）；超過 15 MB 的附件不下載。
- 每次執行都會重新抓所有內文頁（hash 才能比對）；之後若站點變多，再加上依 `Last-Modified` / ETag 的條件請求。

### 10.2 正式環境推送（2026-11-22）

- 4 個來源的 dry-run 結果以 `scrape replay` 推送到 `https://api-v2.mou-welfare.com`：477 筆推送，合併為 463 筆福利（同一福利多個網址），全部可搜尋。
- 推送設定在主機的 `~/.config/mou-welfare/scraper.env`（權限 600）：`API_BASE`、`INGEST_HMAC_KEY`（與 `api.env` 同一把）。手動執行：

  ```bash
  cd ~/Project/mou-welfare/services/scraper
  set -a; . ~/.config/mou-welfare/scraper.env; set +a
  uv run scrape run --push                  # 爬取並推送（狀態檔 .state/state.db）
  uv run scrape replay out/<run_id>         # 推送人工檢查過的 dry-run 結果，不重新爬
  ```

- `replay` 不更新狀態檔：之後第一次 `run --push` 會把這些網址當成新增再送一次，後端判定內容沒變（`unchanged`），不會重新結構化。
- 還沒有排程（P3）。東京主機只能爬金門、新北、基隆與開放資料；其他縣市要等台灣 IP 的執行環境。

**本機端對端測試時發現並修正**

- PDF 抽出的文字含 NUL 字元，Postgres 的 text 存不下 → 爬蟲端去掉控制字元，API 端再過濾一次。
- 結構化工作每秒不到一筆（pg-boss 預設每 2 秒輪詢）→ 縮短為 0.5 秒。

### 10.3 第二批縣市（2026-11-22）

從東京主機可以連線的縣市全部接入：A 族 6 站（臺北、桃園、臺南、嘉義市、屏東、宜蘭）、C 族 2 站（花蓮、彰化）、桃園開放資料。

| 站點 | 縣市 | 族 | 看到 | 標題規則排除 | 隔離 | 推送 | 合併後福利 | 執行時間 |
|---|---|---|---|---|---|---|---|---|
| `taipei` | 臺北市 | A（hex，分頁籤合併） | 131 | 8 | 1 | 122 | 122 | 約 40 分鐘 |
| `tycg` | 桃園市 | A（數字） | 237 | 39（replay 再排除 42） | 13 | 143 | 140 | 約 60 分鐘 |
| `tycg_od` | 桃園市 | 開放資料 26032 | 26 | 0 | 0 | 26 | 26 | 數秒 |
| `tainan` | 臺南市 | A（數字） | 87 | 2 | 10 | 75 | 72 | 約 30 分鐘 |
| `chiayi` | 嘉義市 | A（數字） | 122 | 8 | 7 | 107 | 105 | 約 40 分鐘 |
| `pthg` | 屏東縣 | A（hex，舊版型） | 376 | 48 | 15 | 313 | 305 | 約 90 分鐘 |
| `eland` | 宜蘭縣 | A（數字） | 54 | 11 | 6 | 37 | 37 | 約 10 分鐘 |
| `hualien` | 花蓮縣 | C | 249 | 53（replay 再排除 7） | 6 | 183 | 168 | 約 50 分鐘 |
| `changhua` | 彰化縣 | C | 33 | 0 | 0 | 33 | 33 | 約 3 分鐘 |

- 2026-11-22 以 `scrape replay` 推送到正式環境，共 1,039 筆（合併後 1,008 筆福利）；加上第一批，正式環境共 **12 縣市、1,471 筆福利**。
- 隔離多半是「指向其他頁的導覽頁」（屏東）或內容只在附件裡、附件又抓不到的頁面（宜蘭）。
- 不是個人福利的項目仍有一部分（宣導頁、條例全文、服務據點介紹），等 Gemini 結構化時判為 `rejected`。
- 2026-11-23 後端以 Gemini 全量結構化：1,471 筆中 455 筆判為非個人福利（屏東縣 191／305、新北市 75、花蓮縣 63），在管理後台人工檢核（`docs/admin.md`）。屏東的比例特別高，代表站點起點仍包含大量非福利頁，之後調整 `pthg` 的起點或標題規則可以省下結構化費用。

**這一批遇到、已經處理的問題**

| 問題 | 站點 | 處理方式 |
|---|---|---|
| A 族的參數有數字版（`cl.aspx?n=7313`、`News.aspx?n=1101&sms=9555`），原本只認 16 碼 hex | 桃園、臺南、嘉義市、宜蘭 | `CmsA` 的規則同時接受 hex 與數字，列表多了 `cl.aspx` 與 `News.aspx?n=&sms=` |
| `cp.aspx?n=X` 底下的 `&s=` 是同一福利的分頁籤（服務內容／應備文件／洽辦窗口），被當成 100 筆名為「應備文件」「洽辦資訊」的福利 | 臺北 | 站點設定 `merge_tabs: true`：把分頁籤合併成一筆，每個分頁籤是正文的一節。金門的 `&s=` 是各自獨立的福利，維持預設 |
| 舊版型沒有 `div.page-content`；內文頁的「相關連結」會連到其他分類 | 屏東 | 站點設定 `region` 只放列表區與正文區，不含相關連結 |
| 附件主機有一個 IP 不通（`SYN-SENT`），每個附件等 30 秒逾時再重試，一頁卡 10 分鐘以上 | 宜蘭 | 連線逾時改為 10 秒；同一主機連續 3 次連不上就整次執行不再連（`host_down`）；附件只重試 1 次 |
| 資料開放平台的 robots.txt 是 `User-agent: * / Disallow: /` | 臺南開放資料 79613 | 遵守，不抓；JSON API（soa.tainan.gov.tw）從海外逾時，等台灣 IP 再評估 |
| 開放資料的欄位名稱是英文（`policyName`、`eligibilityCriteria`） | 桃園 26032 | 資料集設定 `labels`：正文與 `structured` 改用中文欄位名 |
| 「違反○○法公告」列出受處分人姓名 | 桃園 | 全域標題規則加入「違反」：不是福利，也不應該把姓名送進資料庫 |
| 正文很長時，整頁文字的選單比例不到門檻；正文區塊空白時又會退回整頁，得到整個選單 | 花蓮 | 站點有 `content` 設定、而且頁面上有這個區塊時，只對正文區塊抽取，不退回整頁；太短就併入附件文字或隔離 |
| 正文區塊裡的 `<script>`（點閱數的 `$.ajax`）被當成文字 | 臺北 | 抽取前移除 `script`、`style`、`noscript` |
| 標題前綴：「1-1彰化縣政府生育補助」「1. 敬老優惠措施」「移至2-6…」 | 彰化、臺南 | 去掉清單編號與「移至」；數字後接單位（「0-6歲」）時保留 |
| 從 Word 貼上的項目符號變成英文字母（「l年滿65歲」）、檔案清單的 MD5、PDF 目錄頁的整排點點 | 花蓮、臺南、屏東 | 抽取時清掉 |
| `sample` / `replay` 用 `splitlines()` 讀 JSONL，正文裡的 U+2028 被當成換行 | 全部 | 改用 `\n` 分行 |
| 起點太廣（「服務項目」含人民團體、公益勸募、公務車租借） | 宜蘭 | 改用各福利分類當起點 |
| 規則寫錯時可能無限制地爬 | 全部 | 每站每次最多 600 頁（`max_pages`），超過記錄成錯誤 |

**新增的設定欄位**：`merge_tabs`、`max_pages`、`extra_hosts`（新北）、`exclude_urls`（基隆）、資料集的 `format`（json / csv）與 `labels`。`replay` 推送前會用目前的標題規則再篩一次，dry-run 之後新增的排除字不必重新爬就會生效。

**還不能從東京接入的縣市**（等台灣 IP，見第 5 節）

| 縣市 | 狀況（2026-11-22） |
|---|---|
| 臺中（網站）、高雄、新竹縣、嘉義縣、臺東、澎湖 | 社會局（處）網站從海外逾時 |
| 雲林、新竹市 | Cloudflare 驗證頁 |
| 苗栗、南投 | 這次測試逾時（之前可以連），回應不穩定 |
| 連江 | 回應不穩定，網站結構未整理 |
| 宜蘭（附件） | 附件主機 `www-ws.e-land.gov.tw` 從海外連不上，內容只在附件裡的頁面被隔離 |

---

### 10.4 排程與監控（2026-11-23）

**排程**：主機的 crontab 每天 02:23（主機時區 UTC+8）執行 `~/apps/mou-welfare-v2/ops/scrape-scheduled.sh`，距離上次開始滿 `SCRAPE_INTERVAL_DAYS` 天（預設 3，可寫在 `scraper.env`）才真的爬。全部跑完約 6～7 小時；上一次還沒結束時不會重複啟動（`flock`）。

```
23 2 * * * $HOME/apps/mou-welfare-v2/ops/scrape-scheduled.sh >> $HOME/.local/state/mou-welfare-scraper/cron.log 2>&1
```

| 項目 | 位置 |
|---|---|
| 程式碼 | 部署目錄 `~/apps/mou-welfare-v2/services/scraper`（每次部署 API 時更新為 main 的最新版） |
| 設定 | `~/.config/mou-welfare/scraper.env`：`API_BASE`、`INGEST_HMAC_KEY`，可加 `SCRAPE_INTERVAL_DAYS` |
| 狀態檔與報告 | `~/.local/share/mou-welfare-scraper/`：`state.db`（各網址的 hash、下架判定）、`out/reports/`、`last-start`（上次開始時間）。放在部署目錄之外，部署時不會被清掉 |
| 紀錄 | `~/.local/state/mou-welfare-scraper/`：每次一個 `.log`、`cron.log`。紀錄與報告保留 60 天 |

```bash
~/apps/mou-welfare-v2/ops/scrape-scheduled.sh --now    # 立刻執行一次（後台顯示為「手動」，下一次排程從這次起算）
```

**監控**：`scrape run --push` 會回報進度給 API，在管理後台的「爬蟲」頁看各站狀態、錯誤與隔離清單（`docs/admin.md` §4.6）。以下情況寄信到 `ALERT_EMAIL`（`docs/backend.md` §8.4.2）：

- 一次執行結束時有站點不正常（數量異常、無法連線、程式錯誤）。
- 執行中超過 4 小時沒有回報（程序被中斷）。
- 超過預定時間一天還沒有新的執行（crontab 被移除、主機重開後沒有恢復）。

**第一次排程執行**：之前的資料是用 `scrape replay` 推送的，不會寫入狀態檔，所以第一次執行時所有網址都當成新增再送一次。後端比對 `content_hash`，內容沒變的判為 `unchanged`，不會重新結構化；hash 規則改過的頁面（例如去掉「下載 N 次」）會重新結構化一次。下架判定要連續 2 次沒看到，所以最早在第二次執行才會發生。

## 11. 待確認事項

- [ ] 從台灣 IP 重新測試標 ⏱ 和 🛡 的站：新竹市、雲林的 Cloudflare 是否仍會擋？
- [ ] 新竹縣、雲林、嘉義縣是否確實屬於 A 族（目前只從網址判斷）。
- [x] 臺中 112089、112090、132989 三個資料集：分別 15、15、4 筆，JSON 可直接下載（不需金鑰），每年更新；欄位含資格、應備文件、收件單位與原始網頁連結。只涵蓋身障、長青、婦女，社會救助與兒少不在其中。
- [ ] 臺南 79613 的實際內容與筆數（2025-06 之後是否還有更新）。
- [ ] 雲林、金門、彰化的福利平台有沒有可介接的 API，或是否需要逐頁抓取。
- [ ] 新北「福利補助自己查」是否仍在運作。
- [ ] 政府資料開放平臺上，有沒有其他縣市的福利補助資料集（本次只搜尋到桃園、臺中、臺南）。
- [x] ~~LLM 分類的費用估算~~：目前不在爬蟲端分類，改由後端結構化時判斷 `isIndividualWelfare`；2026-11-23 全量 1,471 筆約 3.52 美元（`docs/backend.md` §8.3、§10.1）。爬蟲端的 L3 分類（P1）是否還需要，等人工檢核的結果再決定。

---

## 參考來源

- 政府資料開放平臺：[桃園市福利補助資訊 26032](https://data.gov.tw/dataset/26032)、[桃園市福利補助申請資格資訊 26017](https://data.gov.tw/en/datasets/26017)、[臺中市身心障礙福利補助項目 112089](https://data.gov.tw/en/datasets/112089)、[臺中市長青福利補助項目 112090](https://data.gov.tw/en/datasets/112090)、[臺中市婦女福利補助項目 132989](https://data.gov.tw/en/datasets/132989)、[社會福利項目（臺南）79613](https://data.gov.tw/dataset/79613)、[臺北市補助團體一覽表 121369](https://data.gov.tw/dataset/121369)、[臺北市公益彩券盈餘分配 121552](https://data.gov.tw/dataset/121552)
- 搜尋結果確認的網址：[臺中市社會局 老人福利](https://www.society.taichung.gov.tw/13710/13735/13774/13783)、[高雄市社會局 老人福利](https://socbu.kcg.gov.tw/index.php?prog=1&b_id=4)、[新竹市社會處 社會福利](https://society.hccg.gov.tw/ch/home.jsp?id=73&parentpath=0,2,12)、[新竹縣社會處](https://social.hsinchu.gov.tw/)、[彰化縣社會處 津貼及補助專區](https://social.chcg.gov.tw/07other/main.aspx?main_id=2)、[彰化縣福利小幫手](https://lac.chcg.gov.tw/lachelper/home/findAll)、[南投縣社會福利資訊網](https://welfare.nantou.gov.tw/)、[雲林縣社會處](https://social.yunlin.gov.tw/News.aspx?n=9454&sms=16138)、[雲林縣智慧福利資訊網](https://welfare.yunlin.gov.tw/People/Search/64?Q_Keyword=%E8%A3%9C%E5%8A%A9)、[嘉義縣社會局](https://sabcc.cyhg.gov.tw/cp.aspx?n=E81A92B24ABAFB50)、[臺東縣社會處](https://taisoc.taitung.gov.tw/WebSite/About/Organization.aspx?menuid=0zGMn1bvUYg%3D)、[臺東 ttcd](https://ttcd.taitung.gov.tw/index-A.php)、[澎湖縣社會處](https://www.penghu.gov.tw/society/)、[澎湖線上申辦福利專區](https://eservice.penghu.gov.tw/Service.aspx?n=27B2D25ACBA52DAB&p=EA9BC86940EC0DD5)、[連江縣 兒童及少年福利](https://www.matsu.gov.tw/chhtml/news/371043600I/2483)
- 直接連線確認（2026-11-18）：dosw.gov.taipei、www.sw.ntpc.gov.tw、sab.tycg.gov.tw、sab.tainan.gov.tw、www.klcg.gov.tw、social.chiayi.gov.tw、www.miaoli.gov.tw/social_affairs、social.chcg.gov.tw、welfare.nantou.gov.tw、www.pthg.gov.tw/planjdp、sntroot.e-land.gov.tw、sa.hl.gov.tw、social.kinmen.gov.tw、action.kinmen.gov.tw、ttcd.taitung.gov.tw、opendata.tycg.gov.tw（26032 下載）
- 工具：[Crawl4AI 與 trafilatura 搭配（DEV）](https://dev.to/murroughfoley/how-to-use-rs-trafilatura-with-crawl4ai-3nfd)、[Crawl4AI 介紹（Scrapfly）](https://scrapfly.io/blog/posts/crawl4AI-explained)
