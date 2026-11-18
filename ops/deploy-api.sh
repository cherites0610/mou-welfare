#!/usr/bin/env bash
# 部署 v2 API 到自有主機（docs/backend.md §10.1）。
# 在主機上執行：~/apps/mou-welfare-v2/ops/deploy-api.sh [git-ref，預設 origin/main]
# GitHub Actions 透過 SSH（authorized_keys 的 command= 限定只能執行本腳本）傳入要部署的 commit SHA。
#
# 流程：拉取 → 安裝 → build → migration → pm2 reload → 煙霧測試（docs/testing.md §9.2）
# 煙霧測試失敗時退回上一個版本並重新 reload。注意：migration 不會自動回復，
# 因此 migration 必須維持向前相容（只新增欄位/資料表，刪除欄位分兩次部署）。
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/apps/mou-welfare-v2}"
ENV_FILE="${ENV_FILE:-$HOME/.config/mou-welfare/api.env}"
# 部署目標：參數 > SSH forced command 傳入的 commit SHA（GitHub Actions）> origin/main
REF="${1:-origin/main}"
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  # 透過 authorized_keys 的 command= 執行時，只接受完整的 40 碼 SHA，其他內容一律拒絕
  if [[ "$SSH_ORIGINAL_COMMAND" =~ ^[0-9a-f]{40}$ ]]; then
    REF="$SSH_ORIGINAL_COMMAND"
  else
    echo "rejected: expected a 40-char commit SHA" >&2
    exit 2
  fi
fi
APP=mou-welfare-v2-api
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
BASE="http://127.0.0.1:${PORT:-5030}"

log() { echo "[deploy $(date '+%T')] $*"; }

build_and_reload() {
  pnpm install --frozen-lockfile --filter @mou-welfare/api... >/dev/null
  pnpm --filter @mou-welfare/api build >/dev/null
  (cd apps/api && node --env-file="$ENV_FILE" dist/db/migrate.js)
  if pm2 describe "$APP" >/dev/null 2>&1; then
    pm2 reload apps/api/ecosystem.config.cjs --update-env >/dev/null
  else
    pm2 start apps/api/ecosystem.config.cjs >/dev/null
  fi
  pm2 save >/dev/null
}

smoke() {
  local body
  for _ in $(seq 1 30); do
    body="$(curl -fsS -m 5 "$BASE/health" 2>/dev/null || true)"
    if echo "$body" | grep -q '"db":"ok"' && echo "$body" | grep -q '"status":"ok"'; then
      curl -fsS -m 5 -o /dev/null "$BASE/v1/faq" && return 0
    fi
    sleep 1
  done
  log "smoke test failed, last /health: ${body:-<no response>}"
  return 1
}

cd "$DEPLOY_DIR"
PREV="$(git rev-parse HEAD)"
git fetch --quiet origin
git cat-file -e "$REF^{commit}" 2>/dev/null || { log "unknown ref: $REF"; exit 2; }
git reset --quiet --hard "$REF"
NEXT="$(git rev-parse HEAD)"
log "deploying ${PREV:0:7} -> ${NEXT:0:7}"

if build_and_reload && smoke; then
  log "ok: ${NEXT:0:7} is live"
else
  log "rolling back to ${PREV:0:7}"
  git reset --quiet --hard "$PREV"
  build_and_reload
  smoke && log "rolled back to ${PREV:0:7}" || log "ROLLBACK ALSO FAILED — check: pm2 logs $APP"
  exit 1
fi
