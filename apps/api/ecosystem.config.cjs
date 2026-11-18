// pm2 設定（docs/backend.md §10.1）。環境變數由 ~/.config/mou-welfare/api.env 提供。
const ENV_FILE = `${process.env.HOME}/.config/mou-welfare/api.env`

module.exports = {
  apps: [
    {
      name: 'mou-welfare-v2-api',
      script: 'dist/server.js',
      node_args: `--env-file=${ENV_FILE} --enable-source-maps`,
      max_memory_restart: '300M',
      kill_timeout: 10000,
    },
    {
      name: 'mou-welfare-v2-worker',
      script: 'dist/worker.js',
      node_args: `--env-file=${ENV_FILE} --enable-source-maps`,
      max_memory_restart: '300M',
      kill_timeout: 15000,
    },
  ],
}
