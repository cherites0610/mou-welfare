import tailwindcss from '@tailwindcss/vite'

// 管理後台（docs/backend.md §8.7）：純前端單頁應用，靜態檔部署在 Cloudflare Workers（admin.mou-welfare.com）。
// 不做 SSR：所有資料都需要管理者 session，且 cookie 在 API 網域。
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  ssr: false,
  modules: ['@element-plus/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    public: {
      // 建置時以 NUXT_PUBLIC_API_BASE 覆寫；正式環境為 https://api-v2.mou-welfare.com
      apiBase: 'http://localhost:5031',
      // 使用者網站（從後台開啟福利的前台頁面）
      webBase: 'http://localhost:3000',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-TW' },
      title: '哞福利後台',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },
  elementPlus: { importStyle: 'css' },
  typescript: { strict: true },
})
