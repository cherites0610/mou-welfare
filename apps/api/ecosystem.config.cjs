// pm2 設定（docs/backend.md §10.1）。環境變數由 ~/.config/mou-welfare/api.env 提供。
// 預設 WORKER_MODE=inline：背景工作在 API 程序內執行，只需要一個程序。
// 改為 separate 時，取消下方 worker 的註解，並在 api.env 設定 WORKER_MODE=separate。
const ENV_FILE = `${process.env.HOME}/.config/mou-welfare/api.env`

module.exports = {
  apps: [
    {
      name: 'mou-welfare-v2-api',
      script: 'dist/server.js',
      node_args: `--env-file=${ENV_FILE} --enable-source-maps`,
      max_memory_restart: '300M',
      kill_timeout: 15000,
    },
    // {
    //   name: 'mou-welfare-v2-worker',
    //   script: 'dist/worker.js',
    //   node_args: `--env-file=${ENV_FILE} --enable-source-maps`,
    //   max_memory_restart: '300M',
    //   kill_timeout: 15000,
    // },
  ],
}
