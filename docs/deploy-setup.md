# 自動部署設定（GitHub Actions）

> 2026-11-22 已全部設定完成：部署金鑰在 `~/.ssh/mou-welfare-deploy`（authorized_keys 限定 `deploy-api.sh --from-ssh`），5 個 secrets 已透過 GitHub API 寫入。2026-11-23 加入管理後台（`admin` job），沿用同一組 Cloudflare secrets，不需新增。以下保留作為重建時的參考。

`.github/workflows/deploy.yml`：`main` 的 CI 通過後，部署**通過 CI 的那個 commit**；也可在 Actions 頁面手動執行。
未設定 secrets 的 job 會顯示提示並略過，不會失敗。

## 1. API：部署專用 SSH 金鑰（在主機上執行）

這把金鑰在伺服器端被限定**只能執行 `ops/deploy-api.sh`**（不能開 shell、不能轉發），
腳本也只接受 40 碼 commit SHA 作為輸入。

```bash
ssh-keygen -t ed25519 -N '' -C 'github-actions mou-welfare deploy' -f ~/.ssh/mou-welfare-deploy
echo "command=\"$HOME/apps/mou-welfare-v2/ops/deploy-api.sh --from-ssh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat ~/.ssh/mou-welfare-deploy.pub)" >> ~/.ssh/authorized_keys

# 本機測試：應該會執行一次部署（部署目前的 main）
ssh -i ~/.ssh/mou-welfare-deploy -o IdentitiesOnly=yes cherites@localhost "$(git -C ~/apps/mou-welfare-v2 rev-parse origin/main)"
```

## 2. GitHub secrets

Repo → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 |
|---|---|
| `DEPLOY_SSH_KEY` | `~/.ssh/mou-welfare-deploy`（私鑰）的完整內容 |
| `DEPLOY_HOST` | `cherites@43.130.226.136` |
| `DEPLOY_KNOWN_HOSTS` | 在主機執行 `ssh-keyscan -t ed25519 43.130.226.136` 的輸出 |
| `CLOUDFLARE_API_TOKEN` | 新建的 Cloudflare token：範本「Edit Cloudflare Workers」，帳號限定本帳號、Zone 限定 `mou-welfare.com`。前台（`mou-welfare-web`）與管理後台（`mou-welfare-admin`，自訂網域 `admin.mou-welfare.com`）共用 |
| `CLOUDFLARE_ACCOUNT_ID` | `86f177fc5eb1bc6dff97f020c91c98fb` |

> 不要把 telegram-bot 專案的 token 放進 GitHub；前端部署請用專用 token。

## 3. 驗證

Actions → deploy → Run workflow。`api`、`web`、`admin` 三個 job 都應該實際執行（不再顯示「略過」），
`smoke` 會檢查 `https://api.mou-welfare.com/health`、`https://mou-welfare.com/login`
與 `https://admin.mou-welfare.com/login`（後台是靜態檔，`/login` 會 307 轉到 `/login/`，所以用 `curl -L`），
再跑 SEO 檢查 `apps/web/e2e/seo-check.cjs`（docs/testing.md §7.3）。

## 4. 各 job 的內容

| job | 內容 |
|---|---|
| `resolve` | 取得通過 CI 的 commit SHA（手動執行時用目前的 commit），並和**上一次成功的部署**比較變動的檔案，決定 `api`、`web`、`admin` 哪些要部署：`apps/api/`、`services/scraper/`、`ops/` → api；`apps/web/` → web；`apps/admin/` → admin；`packages/shared/`、`package.json`、`pnpm-lock.yaml`、`.nvmrc`、`deploy.yml` 本身 → 全部。手動執行或找不到上一次的部署時全部部署 |
| `api` | SSH 到主機，以 forced command 執行 `ops/deploy-api.sh <sha>`：拉取、安裝、build、migration、`pm2 reload`、煙霧測試，失敗自動退回 |
| `web` | `pnpm --filter @mou-welfare/web build` → `wrangler deploy`（`apps/web/wrangler.jsonc`） |
| `admin` | 以 `NUXT_PUBLIC_API_BASE`、`NUXT_PUBLIC_WEB_BASE` 建置 `@mou-welfare/admin`（`nuxt generate`）→ `wrangler deploy`（`apps/admin/wrangler.jsonc`，詳見 `docs/admin.md` §8） |
| `smoke` | 上述三者完成後檢查正式環境（health、前台與後台 `/login`、SEO） |

另有兩個排程 workflow：`uptime.yml`（每 30 分鐘檢查 API、前台、後台，docs/backend.md §8.4.2）、`seo-check.yml`（每天台灣時間 06:41，docs/testing.md §7.3）。

只改文件（`docs/**`、`*.md`、`.diagram-design`）的 push 不跑 CI，所以也不部署（`ci.yml` 的 `paths-ignore`）。

注意：CI 剛開始時會觸發一次 `deploy`，因為 CI 還沒成功而被略過（`skipped`）；真正的部署在 CI 成功後才執行。
