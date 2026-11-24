// SEO 檢查（docs/testing.md §7.3）：不執行 JavaScript，直接看伺服器端渲染的 HTML。
// 用法：node apps/web/e2e/seo-check.cjs [網站網址，預設 https://mou-welfare.com]
// SEO_MIN_PROGRAMS：sitemap 至少要有幾筆福利（預設 1；正式環境的自動檢查設 500，資料被大量下架時會發現）
const base = (process.argv[2] || 'https://mou-welfare.com').replace(/\/$/, '')
const minPrograms = Number(process.env.SEO_MIN_PROGRAMS || 1)
const failures = []
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures.push(msg)
}
const get = (path, opts = {}) => fetch(base + path, { redirect: 'manual', headers: { 'user-agent': 'MouWelfareSeoCheck' }, ...opts })
const head = (html) => html.split('</head>')[0]
const has = (html, re) => re.test(head(html))

;(async () => {
  const root = await get('/')
  check(root.status === 301 && /\/welfares$/.test(root.headers.get('location') || ''), `/ 永久轉址到 /welfares（${root.status}）`)

  const robots = await (await get('/robots.txt')).text()
  check(/^User-agent: \*/m.test(robots) && /^Sitemap: .+\/sitemap\.xml$/m.test(robots), 'robots.txt 有 User-agent 與 Sitemap')

  const sm = await get('/sitemap.xml')
  const xml = await sm.text()
  const ids = [...xml.matchAll(/\/welfares\/([0-9a-f-]{36})</g)].map((m) => m[1])
  check(sm.status === 200 && ids.length >= minPrograms, `sitemap.xml 列出 ${ids.length} 筆福利（至少 ${minPrograms}）`)

  const list = await (await get('/welfares')).text()
  check(has(list, /rel="canonical" href="[^"]+\/welfares"/), '列表頁 canonical')
  check(has(list, /name="description"/) && /<h1[^>]*>/.test(list), '列表頁 description 與 h1')
  check(/href="\/welfares\/[0-9a-f-]{36}/.test(list), '列表頁有詳情頁連結')

  if (ids.length) {
    const detail = await (await get(`/welfares/${ids[0]}?familyId=x`)).text()
    check(has(detail, new RegExp(`rel="canonical" href="[^"?]+/welfares/${ids[0]}"`)), '詳情頁 canonical 不帶查詢參數')
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) check(has(detail, new RegExp(`property="${p}"`)), `詳情頁 ${p}`)
    check(/application\/ld\+json/.test(detail), '詳情頁 JSON-LD')
    check(!has(detail, /name="robots"/), '上架中的詳情頁沒有 noindex')
  }

  for (const p of ['/login', '/register', '/favorites', '/profile']) {
    const html = await (await get(p)).text()
    check(has(html, /name="robots" content="noindex/) || /^Disallow: \/(login|register|favorites|profile)$/m.test(robots), `${p} 不收錄`)
  }

  const missing = await get('/welfares/00000000-0000-4000-8000-000000000000')
  check(missing.status === 404, `不存在的福利回 404（${missing.status}）`)

  if (failures.length) {
    console.error(`\n${failures.length} 項失敗`)
    process.exit(1)
  }
  console.log('\n全部通過')
})()
