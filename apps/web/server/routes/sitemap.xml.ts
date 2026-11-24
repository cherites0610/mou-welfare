// sitemap.xml：靜態頁、有資料的主題頁（縣市、縣市 × 類別、人生階段，筆數來自 GET /v1/topics）
// 與所有上架中福利的詳情頁（GET /v1/sitemap）。
// 結果在 Cloudflare 邊緣快取 1 小時；API 失敗時回 503，讓爬蟲之後再來，不要給出不完整的清單。
import { CATEGORIES, CATEGORY_SLUGS, CITIES, CITY_SLUGS, type City } from '@mou-welfare/shared'

const STATIC_PAGES = ['/welfares', '/topics', '/question', '/terms', '/private']

type TopicCounts = {
  cities: { city: string; total: number; categories: Record<string, number> }[]
  topics: { slug: string; total: number }[]
}

function topicPages(counts: TopicCounts): string[] {
  const pages = counts.topics.filter((t) => t.total).map((t) => `/topics/${t.slug}`)
  for (const c of counts.cities) {
    if (!c.total || !(CITIES as readonly string[]).includes(c.city)) continue
    const base = `/cities/${CITY_SLUGS[c.city as City]}`
    pages.push(base, ...CATEGORIES.filter((cat) => c.categories[cat]).map((cat) => `${base}/${CATEGORY_SLUGS[cat]}`))
  }
  return pages
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default defineEventHandler(async (event) => {
  const { public: cfg } = useRuntimeConfig(event)
  let programs: { id: string; updatedAt: string }[]
  let counts: TopicCounts
  try {
    ;[programs, counts] = await Promise.all([
      $fetch<{ data: { id: string; updatedAt: string }[] }>('/v1/sitemap', { baseURL: cfg.apiBase }).then((r) => r.data),
      $fetch<{ data: TopicCounts }>('/v1/topics', { baseURL: cfg.apiBase }).then((r) => r.data),
    ])
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
    ...topicPages(counts).map((p) => url(p)),
    ...programs.map((p) => url(`/welfares/${p.id}`, p.updatedAt)),
    '</urlset>',
  ].join('\n')
  setResponseHeaders(event, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
  return body
})
