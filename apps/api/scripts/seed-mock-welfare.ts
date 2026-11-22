// 前端開發用的範例福利：欄位完全照 LLM 結構化後的格式（features/welfare/structure.ts），並涵蓋各種版面情況。
// 全部置頂（pinned_at），在列表最前面；名稱加上「【範例】」，program_key 以 mock: 開頭，不會和爬蟲資料混淆。
// 內容參考真實的福利公告改寫，金額與條件僅供版面測試，不代表實際規定。
//
//   pnpm --filter @mou-welfare/api exec tsx --env-file=.env scripts/seed-mock-welfare.ts           # 寫入或更新
//   pnpm --filter @mou-welfare/api exec tsx --env-file=.env scripts/seed-mock-welfare.ts --remove  # 全部刪除
import { createHash } from 'node:crypto'
import { inArray, like } from 'drizzle-orm'
import { createDb } from '../src/db/client.ts'
import { welfareAttachments, welfarePrograms } from '../src/db/schema/index.ts'

type Mock = Omit<typeof welfarePrograms.$inferInsert, 'programKey' | 'status'> & {
  key: string
  status?: 'active' | 'expired'
  attachments?: { name: string; url: string; text?: string }[]
}

const MOCKS: Mock[] = [
  {
    key: 'taipei-senior-allowance',
    city: '臺北市',
    name: '中低收入老人生活津貼',
    categories: ['老人福利', '社會救助福利'],
    identities: ['65歲以上', '中低收入戶'],
    summary: '設籍臺北市、年滿 65 歲且家庭總收入符合標準的長者，每月可領取生活津貼，補貼日常生活開銷。',
    requirements: [
      '年滿 65 歲，並實際居住於臺北市',
      '設籍臺北市且最近一年居住國內超過 183 日',
      '家庭總收入平均分配全家人口，每人每月未超過最低生活費 2.5 倍',
      '家庭財產（不動產、存款）未超過規定標準',
      '未經政府全額補助收容安置',
    ],
    rewards: [
      '未達最低生活費 1.5 倍者：每月 8,329 元',
      '達 1.5 倍以上、未達 2.5 倍者：每月 4,164 元',
    ],
    contentMd: [
      '## 申請對象',
      '設籍並實際居住臺北市、年滿 65 歲之長者，家庭總收入及財產符合下列標準者。',
      '',
      '## 補助標準',
      '| 家庭總收入（每人每月） | 補助金額 |',
      '| --- | --- |',
      '| 未達最低生活費 1.5 倍 | 每月 8,329 元 |',
      '| 1.5 倍以上、未達 2.5 倍 | 每月 4,164 元 |',
      '',
      '## 應備文件',
      '1. 申請表（可於各區公所索取或網站下載）',
      '2. 申請人身分證正反面影本',
      '3. 申請人郵局或銀行存摺封面影本',
      '',
      '## 申請方式',
      '- 臨櫃：向戶籍所在地區公所社會課申請',
      '- 線上：臺北市民 e 點通',
      '',
      '洽詢電話：1999（外縣市請撥 02-27208889）轉 1520',
    ].join('\n'),
    sourceUrl: 'https://dosw.gov.taipei/',
    sourceKind: 'cms',
    publishedAt: '2026-11-01',
    deadline: null,
    attachments: [
      { name: '中低收入老人生活津貼申請表.pdf', url: 'https://dosw.gov.taipei/example/senior-allowance-form.pdf' },
      { name: '最低生活費及財產標準一覽表.odt', url: 'https://dosw.gov.taipei/example/standards.odt' },
    ],
  },
  {
    key: 'newtaipei-childcare',
    city: '新北市',
    name: '育兒津貼',
    categories: ['婦女與幼兒福利', '兒童及青少年福利'],
    identities: [],
    summary: '家中有未滿 2 歲幼兒、未使用公共或準公共托育服務的家庭，每月可領育兒津貼。',
    requirements: ['幼兒未滿 2 歲', '父母一方設籍新北市', '幼兒未接受公共化或準公共化托育服務'],
    rewards: ['第 1 名子女：每月 5,000 元', '第 2 名子女：每月 6,000 元', '第 3 名以上子女：每月 7,000 元'],
    contentMd: '## 說明\n出生登記後即可向戶籍所在地區公所申請，核准後自申請當月起發給。',
    sourceUrl: 'https://www.sw.ntpc.gov.tw/',
    sourceKind: 'cms',
    publishedAt: '2026-09-16',
    deadline: null,
  },
  {
    key: 'tainan-assistive-devices',
    city: '臺南市',
    name: '115年度身心障礙者輔具費用補助暨居家無障礙設施改善補助（含專業評估及到宅服務）',
    categories: ['身心障礙福利'],
    identities: ['身心障礙者'],
    summary:
      '持有身心障礙證明的市民，購買或維修生活輔具、改善居家無障礙設施，經評估後可依家庭經濟狀況申請補助；評估人員可到宅服務，行動不便者不必親自到場。',
    requirements: [
      '設籍臺南市並領有身心障礙證明（手冊）者',
      '經輔具評估人員評估確有使用需求，且所申請項目與障礙類別、程度相符；同一項目在最低使用年限內不得重複申請，但因成長、障礙程度改變或輔具損壞無法修復等情形，經評估後不在此限',
      '最近一年未接受其他政府機關相同項目之補助',
      '購買前應先提出申請並取得核定，未經核定先行購買者不予補助',
    ],
    rewards: [
      '低收入戶：依補助基準最高金額全額補助',
      '中低收入戶：補助最高金額之 75%',
      '一般戶：補助最高金額之 50%',
      '居家無障礙設施改善（如扶手、斜坡道、浴室改善）：每戶每 5 年最高 10 萬元',
    ],
    contentMd: [
      '## 補助項目與最高金額（節錄）',
      '| 輔具類別 | 項目 | 最高補助金額 | 最低使用年限 | 評估要求 | 備註 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 個人行動輔具 | 輕型輪椅（A 款） | 4,000 元 | 3 年 | 需評估 | 限下肢障礙 |',
      '| 個人行動輔具 | 電動輪椅 | 36,000 元 | 6 年 | 需評估 | 需附醫師診斷證明 |',
      '| 溝通與資訊輔具 | 擴視機 | 25,000 元 | 5 年 | 需評估 | 限視覺障礙 |',
      '| 居家生活輔具 | 居家用照顧床 | 8,000 元 | 5 年 | 免評估 | — |',
      '',
      '## 注意事項',
      '請先申請、核定後再購買；發票抬頭須為申請人本人，並於核定日起 6 個月內檢據請款。',
    ].join('\n'),
    sourceUrl: 'https://social.tainan.gov.tw/',
    sourceKind: 'cms',
    publishedAt: '2026-01-05',
    deadline: '2026-12-31',
    attachments: [
      { name: '身心障礙者輔具費用補助申請表.docx', url: 'https://social.tainan.gov.tw/example/form.docx' },
      { name: '輔具費用補助基準表.pdf', url: 'https://social.tainan.gov.tw/example/standards.pdf' },
      { name: '居家無障礙設施改善補助申請須知.pdf', url: 'https://social.tainan.gov.tw/example/home.pdf' },
    ],
  },
  {
    key: 'kinmen-double-ninth',
    city: '金門縣',
    name: '115年度重陽敬老禮金',
    categories: ['老人福利'],
    identities: ['65歲以上'],
    status: 'expired',
    summary: '重陽節前設籍金門縣滿一年、年滿 65 歲的長者，可領取敬老禮金。',
    requirements: ['115 年 10 月 1 日前年滿 65 歲', '設籍金門縣滿一年以上'],
    rewards: ['每人 2,000 元'],
    contentMd: '由村里辦公處造冊，主動發放，不需申請。未領到者請於期限內洽鄉鎮公所。',
    sourceUrl: 'https://social.kinmen.gov.tw/',
    sourceKind: 'cms',
    publishedAt: '2026-09-01',
    deadline: '2026-10-31',
  },
  {
    key: 'keelung-emergency',
    city: '基隆市',
    name: '急難救助',
    categories: ['社會救助福利', '兒童及青少年福利', '其他福利'],
    identities: [],
    summary: '家庭因負擔家計者死亡、失蹤、重病或遭遇意外，導致生活陷入困境時，可申請一次性急難救助金。',
    requirements: [
      '負擔家庭主要生計者死亡、失蹤或罹患重傷病，致生活陷於困境',
      '遭受意外傷害或其他原因，致生活陷於困境',
      '於事故發生日起 3 個月內提出申請',
    ],
    rewards: ['每人每年最高 3 萬元，視事故情形核定'],
    contentMd: '請攜帶相關證明文件（診斷證明、死亡證明或警察機關證明）向戶籍所在地區公所申請。',
    sourceUrl: 'https://www.klcg.gov.tw/tw/social/',
    sourceKind: 'cms',
    publishedAt: '2025-12-01',
    deadline: null,
  },
  {
    key: 'taichung-indigenous-opendata',
    city: '臺中市',
    name: '原住民族建購及修繕住宅補助',
    categories: ['其他福利'],
    identities: ['原住民'],
    summary: '設籍臺中市的原住民家庭，首次購置或修繕自有住宅，可申請一次性補助。',
    requirements: ['具原住民身分並設籍臺中市', '家庭成員均無自有住宅（建購）或住宅已老舊需修繕'],
    rewards: ['建購住宅：每戶 22 萬元', '修繕住宅：每戶最高 10 萬元'],
    contentMd: [
      '- **福利名稱**：原住民族建購及修繕住宅補助',
      '- **主管機關**：臺中市政府原住民族事務委員會',
      '- **申請資格**：具原住民身分並設籍本市，家庭成員均無自有住宅',
      '- **補助內容**：建購 22 萬元；修繕最高 10 萬元',
      '- **申請期間**：每年 3 月 1 日至 4 月 30 日',
      '- **聯絡電話**：04-22289111',
    ].join('\n'),
    sourceFields: {
      福利名稱: '原住民族建購及修繕住宅補助',
      主管機關: '臺中市政府原住民族事務委員會',
      申請期間: '每年 3 月 1 日至 4 月 30 日',
    },
    sourceUrl: 'https://opendata.taichung.gov.tw/',
    sourceKind: 'opendata',
    publishedAt: null,
    deadline: null,
  },
  {
    key: 'taoyuan-new-residents',
    city: '桃園市',
    name: '新住民婦女生育補助',
    categories: ['婦女與幼兒福利'],
    identities: ['女性', '外籍配偶家庭'],
    summary: '尚未取得國籍的新住民女性在臺生產，可申請產前檢查及生育補助。',
    requirements: ['與設籍桃園市之國人結婚', '尚未取得我國國籍', '於國內醫療院所生產'],
    rewards: ['產前檢查：每次最高 600 元，共 10 次', '生育補助：每胎 3 萬元'],
    contentMd: '## 申請地點\n戶籍所在地衛生所或新住民服務中心。',
    sourceUrl: 'https://sab.tycg.gov.tw/',
    sourceKind: 'cms',
    publishedAt: '2026-06-20',
    deadline: null,
  },
]

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('需要 DATABASE_URL（用 --env-file 帶入）')
  const { db, sql } = createDb(url, { max: 1 })
  try {
    if (process.argv.includes('--remove')) {
      const rows = await db
        .delete(welfarePrograms)
        .where(like(welfarePrograms.programKey, 'mock:%'))
        .returning({ id: welfarePrograms.id })
      console.log(`removed ${rows.length} mock programs`)
      return
    }
    const base = Date.now()
    for (const [i, { key, attachments = [], status = 'active', ...m }] of MOCKS.entries()) {
      const contentHash = hash(m.contentMd ?? '')
      const values = {
        ...m,
        name: `【範例】${m.name}`,
        programKey: `mock:${key}`,
        status,
        siteId: 'mock',
        contentHash,
        // 視為已由 LLM 結構化：backfill 與重新結構化都不會動到
        structuredHash: contentHash,
        structuredBy: 'llm' as const,
        structuredAt: new Date(),
        // 依清單順序置頂：第一筆最前面
        pinnedAt: new Date(base - i * 1000),
      }
      const [row] = await db
        .insert(welfarePrograms)
        .values(values)
        .onConflictDoUpdate({ target: welfarePrograms.programKey, set: values })
        .returning({ id: welfarePrograms.id })
      await db.delete(welfareAttachments).where(inArray(welfareAttachments.programId, [row!.id]))
      if (attachments.length) {
        await db
          .insert(welfareAttachments)
          .values(attachments.map((a) => ({ programId: row!.id, name: a.name, url: a.url, text: a.text ?? '' })))
      }
      console.log(`${values.programKey} → ${row!.id}`)
    }
  } finally {
    await sql.end()
  }
}

await main()
