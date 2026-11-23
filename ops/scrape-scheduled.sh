#!/usr/bin/env bash
# 爬蟲排程（docs/scraper.md §10.4）。crontab 每天觸發一次，距離上次開始滿 SCRAPE_INTERVAL_DAYS 天（預設 3）才真的執行。
#
#   ~/apps/mou-welfare-v2/ops/scrape-scheduled.sh          # 排程用：還沒到時間就直接結束
#   ~/apps/mou-welfare-v2/ops/scrape-scheduled.sh --now    # 立刻執行一次（手動，後台顯示為「手動」）
#
# 程式碼用部署目錄（每次部署 API 時更新為 main 的最新版）；狀態檔與報告放在部署目錄之外，部署時不會被清掉。
# 進度與結果回報給 API（POST /internal/scrape-runs），在管理後台的「爬蟲」頁查看。
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/mou-welfare-v2}"
ENV_FILE="${ENV_FILE:-$HOME/.config/mou-welfare/scraper.env}"
DATA_DIR="${DATA_DIR:-$HOME/.local/share/mou-welfare-scraper}"
LOG_DIR="${LOG_DIR:-$HOME/.local/state/mou-welfare-scraper}"
UV="${UV:-$HOME/.local/bin/uv}"

trigger=schedule
[[ "${1:-}" == "--now" ]] && trigger=manual

mkdir -p "$DATA_DIR" "$LOG_DIR"
# 全部跑完約 6～7 小時；上一次還沒結束就不再啟動
exec 9>"$LOG_DIR/lock"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] 上一次還在執行，略過"
  exit 0
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
interval="${SCRAPE_INTERVAL_DAYS:-3}"

stamp="$DATA_DIR/last-start"
if [[ $trigger == schedule && -f $stamp ]]; then
  age=$(( $(date +%s) - $(stat -c %Y "$stamp") ))
  # 保留 2 小時的誤差：cron 每天同一時間觸發，上一次可能晚幾分鐘才開始
  if (( age < interval * 86400 - 7200 )); then
    exit 0
  fi
fi
touch "$stamp"

run_log="$LOG_DIR/$(date +%Y%m%d-%H%M%S).log"
echo "[$(date '+%F %T')] 開始（$trigger，間隔 $interval 天）→ $run_log"
cd "$APP_DIR/services/scraper"
status=0
{
  "$UV" sync --frozen --no-dev --quiet
  "$UV" run --frozen --no-dev scrape run --push --trigger "$trigger" --interval-days "$interval" \
    --state "$DATA_DIR/state.db" --out "$DATA_DIR/out"
} >"$run_log" 2>&1 || status=$?
# 結束碼 1＝有站點不是 ok（細節在後台與通知信）；其他代表程式本身出錯
echo "[$(date '+%F %T')] 結束（exit $status）"

# 紀錄與報告保留 60 天
find "$LOG_DIR" -maxdepth 1 -name '*.log' -mtime +60 -delete
[[ -d "$DATA_DIR/out/reports" ]] && find "$DATA_DIR/out/reports" -type f -mtime +60 -delete
exit 0
