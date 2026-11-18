# 自動部署設定（GitHub Actions）

`.github/workflows/deploy.yml`：`main` 的 CI 通過後，部署**通過 CI 的那個 commit**；也可在 Actions 頁面手動執行。
未設定 secrets 的 job 會顯示提示並略過，不會失敗。

## 1. API：部署專用 SSH 金鑰（在主機上執行）

這把金鑰在伺服器端被限定**只能執行 `ops/deploy-api.sh`**（不能開 shell、不能轉發），
腳本也只接受 40 碼 commit SHA 作為輸入。

```bash
ssh-keygen -t ed25519 -N '' -C 'github-actions mou-welfare deploy' -f ~/.ssh/mou-welfare-deploy
echo "command=\"$HOME/apps/mou-welfare-v2/ops/deploy-api.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat ~/.ssh/mou-welfare-deploy.pub)" >> ~/.ssh/authorized_keys

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
| `CLOUDFLARE_API_TOKEN` | 新建的 Cloudflare token：範本「Edit Cloudflare Workers」，帳號限定本帳號、Zone 限定 `mou-welfare.com` |
| `CLOUDFLARE_ACCOUNT_ID` | `86f177fc5eb1bc6dff97f020c91c98fb` |

> 不要把 telegram-bot 專案的 token 放進 GitHub；前端部署請用專用 token。

## 3. 驗證

Actions → deploy → Run workflow。`api`、`web` 兩個 job 都應該實際執行（不再顯示「略過」），
`smoke` 會檢查 `https://api-v2.mou-welfare.com/health` 與 `https://v2.mou-welfare.com/login`。
