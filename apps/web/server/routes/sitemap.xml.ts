// sitemap.xml：靜態頁與所有上架中福利的詳情頁（福利清單來自 API 的 GET /v1/sitemap）。
// 結果在 Cloudflare 邊緣快取 1 小時；API 失敗時回 503，讓爬蟲之後再來，不要給出不完整的清單。
const STATIC_PAGES = ['/welfares', '/question', '/terms', '/private']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default defineEventHandler(async (event) => {
  const { public: cfg } = useRuntimeConfig(event)
  let programs: { id: string; updatedAt: string }[]
  try {
    programs = (await $fetch<{ data: { id: string; updatedAt: string }[] }>('/v1/sitemap', { baseURL: cfg.apiBase })).data
  } catch (err) {
    console.error('sitemap: 讀取福利清單失敗', err)
    setResponseStatus(event, 503)
    setResponseHeader(event, 'Retry-After', 600)
    return 'sitemap 暫時無法產生'
  }
  const url = (path: string, lastmod?: string) =>
    `<url><loc>${esc(cfg.siteUrl + path)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}</url>`
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...STATIC_PAGES.map((p) => url(p)),
    ...programs.map((p) => url(`/welfares/${p.id}`, p.updatedAt)),
    '</urlset>',
  ].join('\n')
  setResponseHeaders(event, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
  return body
})
