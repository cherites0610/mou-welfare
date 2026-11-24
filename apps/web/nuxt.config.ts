import tailwindcss from '@tailwindcss/vite'

// 前端部署在 Cloudflare Workers（docs/backend.md §10.2）。介面沿用 v1（docs/v1/styles.html）。
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  modules: ['@element-plus/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  nitro: { preset: 'cloudflare_module' },
  runtimeConfig: {
    public: {
      // NUXT_PUBLIC_API_BASE 覆寫；正式環境為 https://api.mou-welfare.com
      apiBase: 'http://localhost:5031',
      // NUXT_PUBLIC_LIFF_ID 覆寫；空字串＝不啟用 LIFF 自動登入（plugins/liff.client.ts）
      liffId: '',
    },
  },
  // 登入相關與個人頁面只在瀏覽器渲染（session cookie 在 API 網域，SSR 讀不到）
  routeRules: {
    '/login': { ssr: false },
    '/register': { ssr: false },
    '/register/**': { ssr: false },
    '/verify': { ssr: false },
    '/oauth-callback': { ssr: false },
    '/forgot-password': { ssr: false },
    '/reset-password': { ssr: false },
    '/profile': { ssr: false },
    '/profile/**': { ssr: false },
    '/favorites': { ssr: false },
    '/chat': { ssr: false },
    // v1 的家庭頁在 v2 併入個人設定
    '/family': { redirect: { to: '/profile', statusCode: 301 } },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-TW' },
      title: '哞福利 | 一站式政府福利查詢平台',
      meta: [
        // 與 v1 相同（docs/v1/styles.html 建議之後改為允許縮放）
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
        {
          name: 'description',
          content: '哞福利幫你快速找到符合資格的政府補助與社會福利，支援條件篩選、AI 智慧摘要與家庭成員資格分析。',
        },
      ],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },
  elementPlus: { importStyle: 'css' },
  typescript: { strict: true },
})
