// 登入註冊流程 E2E（docs/testing.md §7.2）。需要：本機 API（MAIL_DRIVER=log，輸出導到 E2E_MAIL_LOG）與前端 dev server。
// 執行：node apps/web/e2e/auth-flow.cjs（需先安裝 playwright 與 chromium）
// 會在 API 的資料庫建立 e2e*@example.com 測試帳號，請只對開發 / staging 資料庫執行。
const { chromium } = require('playwright')
const fs = require('fs')

const WEB = process.env.E2E_WEB ?? 'http://localhost:3000'
const API = process.env.E2E_API ?? 'http://localhost:5031'
const LOG = process.env.E2E_MAIL_LOG ?? '/tmp/mw-api-dev.log'
const OUT = process.env.E2E_OUT ?? '/tmp/e2e'
fs.mkdirSync(OUT, { recursive: true })

const email = `e2e${Date.now()}@example.com`
const pw1 = 'Moo-Welfare-2026!'
const pw2 = 'Brand-New-Pass-99'

/** 從 API 的 log 取出寄給 email 的最新信件連結 */
async function linkFor(to, subjectPart) {
  for (let i = 0; i < 30; i++) {
    const log = fs.readFileSync(LOG, 'utf8')
    const blocks = log.split('[mail] ').filter((b) => b.startsWith(`to=${to}`) && b.includes(subjectPart))
    const last = blocks.at(-1)
    const m = last && last.match(/https?:\/\/\S+/)
    if (m) return m[0]
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`找不到寄給 ${to} 的信：${subjectPart}`)
}

const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push(`✅ ${name}`)
  } catch (e) {
    results.push(`❌ ${name}：${e.message.split('\n')[0]}`)
    throw e
  }
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-TW' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  try {
    await step('登入頁（v2）與 v1 對照截圖', async () => {
      await page.goto(`${WEB}/login`)
      await page.getByRole('heading', { name: '登入' }).waitFor()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/01-login-v2.png` })
      const v1 = await ctx.newPage()
      await v1.goto('https://mou-welfare.com/login', { waitUntil: 'networkidle' }).catch(() => {})
      await v1.waitForTimeout(800)
      await v1.screenshot({ path: `${OUT}/01-login-v1.png` })
      await v1.close()
    })

    await step('註冊 → 導向「驗證信箱」頁，顯示遮罩後的信箱', async () => {
      await page.goto(`${WEB}/register`)
      await page.getByPlaceholder('請輸入信箱').fill(email)
      await page.getByPlaceholder('請輸入密碼').fill(pw1)
      await page.getByPlaceholder('請再次輸入密碼').fill(pw1)
      await page.screenshot({ path: `${OUT}/02-register.png` })
      await page.getByRole('button', { name: '創建' }).click()
      await page.waitForURL(/\/verify\?/)
      await page.getByText(`${email.slice(0, 3)}***`).first().waitFor()
      await page.screenshot({ path: `${OUT}/03-verify.png` })
    })

    await step('未驗證前登入 → 顯示「信箱尚未驗證」與重寄連結', async () => {
      await page.goto(`${WEB}/login`)
      await page.getByPlaceholder('請輸入帳號').fill(email)
      await page.getByPlaceholder('請輸入密碼').fill(pw1)
      await page.getByRole('button', { name: '登入', exact: true }).click()
      await page.getByText('信箱尚未驗證').waitFor()
      await page.getByRole('button', { name: '重寄驗證信' }).waitFor()
    })

    await step('點擊驗證信連結 → 自動登入並進入「填寫個人資料」', async () => {
      const link = await linkFor(email, '驗證')
      await page.goto(link)
      await page.waitForURL(/\/register\/profile/)
      await page.getByRole('heading', { name: '填寫個人資料' }).waitFor()
    })

    await step('填寫個人資料（含 Element Plus 下拉）並送出', async () => {
      await page.getByPlaceholder('請輸入姓名').fill('哞哞測試')
      const pick = async (placeholder, option) => {
        await page.locator('.el-select').filter({ hasText: placeholder }).first().click()
        await page.locator('.el-select-dropdown__item:visible', { hasText: option }).first().click()
      }
      await pick('年', '1960年')
      await pick('月', '5月')
      await pick('日', '20日')
      await page.getByRole('button', { name: '女性' }).click()
      await pick('請選擇城市', '金門縣')
      await page.getByRole('button', { name: '原住民' }).click()
      await page.screenshot({ path: `${OUT}/04-profile.png`, fullPage: true })
      await page.getByRole('button', { name: '完成創建' }).click()
      await page.waitForURL(/\/welfares/)
    })

    await step('後端已儲存個人資料（65歲以上由生日推得，只送特殊身分）', async () => {
      const me = await page.evaluate(async (api) => (await fetch(`${api}/v1/me`, { credentials: 'include' })).json(), API)
      const d = me.data
      if (d.name !== '哞哞測試' || d.birthday !== '1960-05-20' || d.gender !== '女性' || d.city !== '金門縣')
        throw new Error(JSON.stringify(d))
      if (JSON.stringify(d.identities) !== '["原住民"]') throw new Error(`identities=${JSON.stringify(d.identities)}`)
      await page.screenshot({ path: `${OUT}/05-welfares-loggedin.png` })
    })

    await step('Header 顯示登入的信箱；登出後回到未登入狀態', async () => {
      await page.getByText(email).waitFor()
      await page.goto(`${WEB}/profile`)
      await page.getByRole('button', { name: '登出' }).click()
      await page.waitForURL(/\/welfares/)
      await page.getByRole('button', { name: '登入' }).waitFor()
    })

    await step('需登入頁面在未登入時導向登入頁並帶 redirect', async () => {
      await page.goto(`${WEB}/profile`)
      await page.waitForURL(/\/login\?redirect=(%2F|\/)profile/)
    })

    await step('錯誤密碼顯示「帳號或密碼錯誤」', async () => {
      await page.getByPlaceholder('請輸入帳號').fill(email)
      await page.getByPlaceholder('請輸入密碼').fill('wrong-password')
      await page.getByRole('button', { name: '登入', exact: true }).click()
      await page.getByText('帳號或密碼錯誤').waitFor()
    })

    await step('忘記密碼 → 重設連結 → 設定新密碼', async () => {
      await page.goto(`${WEB}/forgot-password`)
      await page.getByPlaceholder('請輸入信箱').fill(email)
      await page.getByRole('button', { name: '發送重設連結' }).click()
      await page.waitForURL(/\/verify\?flow=reset/)
      const link = await linkFor(email, '重設密碼')
      await page.goto(link)
      await page.waitForURL(/\/reset-password\?token=/)
      await page.getByPlaceholder('請輸入新密碼').fill(pw2)
      await page.getByPlaceholder('請再次輸入新密碼').fill(pw2)
      await page.screenshot({ path: `${OUT}/06-reset.png` })
      await page.getByRole('button', { name: '確定' }).click()
      await page.waitForURL(/\/login/)
    })

    await step('用新密碼登入並回到 redirect 頁面', async () => {
      await page.goto(`${WEB}/login?redirect=/profile`)
      await page.getByPlaceholder('請輸入帳號').fill(email)
      await page.getByPlaceholder('請輸入密碼').fill(pw2)
      await page.getByRole('button', { name: '登入', exact: true }).click()
      await page.waitForURL(/\/profile/)
      await page.getByText('哞哞測試').waitFor()
      await page.screenshot({ path: `${OUT}/07-profile.png` })
    })

    await step('手機版版面（底部導航）', async () => {
      const m = await browser.newContext({ ...require('playwright').devices['iPhone 13'], locale: 'zh-TW' })
      const mp = await m.newPage()
      await mp.goto(`${WEB}/register`)
      await mp.waitForTimeout(800)
      await mp.screenshot({ path: `${OUT}/08-register-mobile.png` })
      await mp.goto(`${WEB}/welfares`)
      await mp.getByText('首頁').last().waitFor()
      await mp.screenshot({ path: `${OUT}/09-welfares-mobile.png` })
      await m.close()
    })
  } catch {
    await page.screenshot({ path: `${OUT}/zz-failure.png` }).catch(() => {})
  } finally {
    console.log(results.join('\n'))
    if (errors.length) console.log('page errors:', errors.slice(0, 5))
    console.log('test user:', email)
    await browser.close()
  }
})()
