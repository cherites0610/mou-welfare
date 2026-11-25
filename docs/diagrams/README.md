# 圖表

| 檔案 | 內容 |
|---|---|
| `mou-welfare-architecture.html` | 系統架構：Cloudflare（前台、管理後台、R2）、自有主機（Hono API、Postgres、爬蟲）、外部服務（LINE、Gemini） |
| `mou-welfare-deployment.html` | 部署：GitHub Actions、主機上的 Caddy / pm2 / Postgres / crontab、Cloudflare Workers 與 R2，含 port 與版本 |

用瀏覽器直接開。版型依 [diagram-design](https://github.com/cathrynlavery/diagram-design) skill，配色是 `mou-welfare` profile（根目錄的 `.diagram-design`；淺色強調色 `#5D7A00`，即 `--color-mygreen-400`）。

架構或版本有變動時，修改 `gen.py` 裡的節點與連線後重新產生：

```bash
python3 docs/diagrams/gen.py docs/diagrams
```

產生後用 diagram-design 附的檢查（在 skill 目錄執行）：`python3 scripts/self_check.py <file>`、`python3 scripts/verify_geometry.py <file>`。
