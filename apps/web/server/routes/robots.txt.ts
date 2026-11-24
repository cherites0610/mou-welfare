// robots.txt：登入後才有意義的頁面不讓爬蟲進來（這些頁面本身也有 noindex），並指出 sitemap。
// Cloudflare 會在前面加上它的內容訊號（content signals）註解。
const DISALLOW = [
  '/login',
  '/register',
  '/verify',
  '/oauth-callback',
  '/forgot-password',
  '/reset-password',
  '/profile',
  '/favorites',
  '/chat',
]

export default defineEventHandler((event) => {
  const { public: cfg } = useRuntimeConfig(event)
  setResponseHeaders(event, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' })
  return ['User-agent: *', ...DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${cfg.siteUrl}/sitemap.xml`, ''].join('\n')
})
