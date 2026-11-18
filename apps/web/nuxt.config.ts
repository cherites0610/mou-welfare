// 前端部署在 Cloudflare Workers（docs/backend.md §10.2）
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  nitro: {
    preset: 'cloudflare_module',
  },
  runtimeConfig: {
    public: {
      // 伺服器端與瀏覽器端都呼叫同一個 API 網域（NUXT_PUBLIC_API_BASE 覆寫）
      apiBase: 'http://127.0.0.1:5030',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-TW' },
      title: '哞福利 | 一站式政府福利查詢平台',
      meta: [
        {
          name: 'description',
          content: '哞福利幫你快速找到符合資格的政府補助與社會福利，支援條件篩選、AI 智慧摘要與家庭成員資格分析。',
        },
      ],
    },
  },
  typescript: { strict: true },
})
