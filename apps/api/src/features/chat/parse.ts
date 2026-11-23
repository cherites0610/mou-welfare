// 聊天的規則解析（docs/backend.md §8.9）：從問題抓出縣市、身分、類別，不呼叫 LLM。
// 身分與類別只用來加權檢索、告訴 LLM「問題提到的條件」；紅黃綠燈一律用個人資料（或家人資料）比對。
import { type Category, CITIES, type City, type Identity } from '@mou-welfare/shared'

export type ChatFilters = {
  /** 檢索的縣市限制；明確提到的優先，沒提到時用個人資料的居住縣市 */
  cities: City[]
  /** 問題提到的身分（加權檢索用） */
  identities: Identity[]
  /** 問題提到的類別（加權檢索用） */
  categories: Category[]
  /** 這段對話的主題（上一個完整的問題）；追問時沿用 */
  topic: string
  /** 這一輪拿去檢索的文字：完整的問題就是問題本身；追問是「主題＋追問」 */
  query: string
}

export type Parsed = {
  cities: City[]
  identities: Identity[]
  categories: Category[]
  /** 去掉縣市、語助詞後剩下的關鍵字（關鍵字分數用） */
  keywords: string
  /** 只換了條件的追問（例如「那臺北呢」），主題沿用上一輪 */
  followUp: boolean
}

const norm = (s: string) => s.replace(/台/g, '臺').replace(/\s+/g, ' ').trim()

// 縣市別名：全名 → 去掉「市／縣」→ 常見口語。新竹、嘉義同時有市和縣，只說「新竹」時兩個都算
const CITY_ALIASES: [string, City[]][] = (() => {
  const out: [string, City[]][] = CITIES.map((c) => [c, [c]])
  const byBase = new Map<string, City[]>()
  for (const c of CITIES) byBase.set(c.slice(0, -1), [...(byBase.get(c.slice(0, -1)) ?? []), c])
  for (const [base, cs] of byBase) out.push([base, cs])
  out.push(['雙北', ['臺北市', '新北市']], ['北市', ['臺北市']], ['馬祖', ['連江縣']])
  // 長的先比對，比對到就從字串移除（「新北」不會再被「北市」吃到）
  return out.sort((a, b) => b[0].length - a[0].length)
})()

// 口語 → 身分。長的先比對（「中低收」要在「低收」之前）
const IDENTITY_WORDS: [RegExp, Identity][] = [
  [/中低收入?戶?/g, '中低收入戶'],
  [/低收入?戶?/g, '低收入戶'],
  [/身心障礙|身障|殘障|障礙者|障礙手冊|身障證明|輪椅|失能/g, '身心障礙者'],
  [/原住民|原民/g, '原住民'],
  [/榮民|退伍軍人|老兵/g, '榮民'],
  [/外籍配偶|外配|新住民|新移民/g, '外籍配偶家庭'],
  [/老人|長者|長輩|銀髮|老年|年長|阿公|阿嬤|爺爺|奶奶/g, '65歲以上'],
  [/懷孕|孕婦|孕期|產婦|坐月子/g, '女性'],
]

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/老人|長者|長輩|銀髮|老年|年長|阿公|阿嬤|爺爺|奶奶|敬老|重陽|長照/, '老人福利'],
  [/兒童|小孩|孩子|小朋友|育兒|托育|幼兒|嬰兒|寶寶|新生兒|青少年|學生|未成年|子女|托嬰|保母|保姆/, '兒童及青少年福利'],
  [/懷孕|孕婦|生育|生產|產後|坐月子|婦女|育嬰|新生兒|嬰兒|單親|媽媽|母親/, '婦女與幼兒福利'],
  [/低收|中低收|急難|救助|經濟困難|清寒|失業|弱勢|紓困|馬上關懷|租屋|房租|喪葬/, '社會救助福利'],
  [/身心障礙|身障|殘障|障礙|輔具|失能|復康巴士|手語/, '身心障礙福利'],
]

// 口語 → 公告常用的寫法，只加進關鍵字（「身障租屋」在名稱裡是「身心障礙者房屋租金」）
const SYNONYMS: [RegExp, string][] = [
  [/身障|殘障/, '身心障礙'],
  [/租屋|租房|房租/, '房屋租金'],
  [/輪椅|助行器|拐杖/, '輔具'],
  [/生小孩|生孩子|生產|懷孕/, '生育'],
  [/早療/, '早期療育'],
  [/單親|離婚|喪偶/, '特殊境遇家庭'],
  [/過世|往生|死亡/, '喪葬'],
  [/經濟困難|變故|沒錢|失業/, '急難救助 急難紓困'],
  [/托嬰|保母|保姆/, '托育'],
  [/電費|呼吸器|製氧機/, '維生器材 用電'],
  [/外配|外籍配偶|新移民/, '新住民'],
]

// 年齡寫成數字時（「我 70 歲」「3歲小孩」）
const AGE = /(\d{1,3})\s*(?:歲|足歲)/g

// 去掉後判斷「是不是只換了條件」的語助詞與泛問句
const FILLERS =
  /那麼|的話|如果是?|假如|換成|改成|改問|請問|想問|我想|我要|可以|能不能|有沒有|有什麼|有哪些|有嗎|什麼|哪些|住在|我是|我們|幫我查|幫我找|查詢|一下|看看|相關|資訊|資料|福利|補助|津貼|那|呢|嗎|嘛|吧|呀|啊|喔|哦|耶|的|我|你|[，。！？、,.!?~～\s]/g

export function parseQuery(text: string): Parsed {
  let rest = norm(text)
  const cities = new Set<City>()
  for (const [alias, cs] of CITY_ALIASES) {
    if (rest.includes(alias)) {
      for (const c of cs) cities.add(c)
      rest = rest.split(alias).join(' ')
    }
  }

  const identities = new Set<Identity>()
  let idRest = rest
  for (const [re, id] of IDENTITY_WORDS) {
    if (re.test(idRest)) {
      identities.add(id)
      idRest = idRest.replace(re, ' ')
    }
    re.lastIndex = 0
  }
  for (const m of rest.matchAll(AGE)) {
    const n = Number(m[1])
    if (n >= 65 && n < 130) identities.add('65歲以上')
  }

  const categories = new Set<Category>()
  for (const [re, cat] of CATEGORY_WORDS) if (re.test(rest)) categories.add(cat)

  // 「福利」「補助」「津貼」幾乎每筆都有，不當關鍵字
  const extra = SYNONYMS.filter(([re]) => re.test(rest)).map(([, w]) => w)
  const keywords = [rest.replace(AGE, ' ').replace(FILLERS, ' '), ...extra].join(' ').replace(/\s+/g, ' ').trim()
  // 去掉縣市、身分、年齡與語助詞後沒有剩下實質內容 → 追問（沿用上一輪的主題）
  const residue = idRest.replace(AGE, '').replace(FILLERS, '')
  const followUp = residue.length <= 1 && (cities.size > 0 || identities.size > 0)

  return { cities: [...cities], identities: [...identities], categories: [...categories], keywords, followUp }
}

/**
 * 這一輪的條件：
 * - 縣市：提到就換；沒提到就沿用上一輪，第一輪沒提到用個人資料的居住縣市。
 * - 身分、類別：追問時與上一輪合併，新的問題重新算。
 * - 主題：追問時沿用上一輪（「那臺北呢」本身沒有可檢索的內容），新的問題用這一句。
 */
export function mergeFilters(p: Parsed, text: string, prev: ChatFilters | null, profileCity: string | null): ChatFilters {
  const homeCity = (CITIES as readonly string[]).includes(profileCity ?? '') ? [profileCity as City] : []
  const cities = p.cities.length ? p.cities : prev ? prev.cities : homeCity
  if (p.followUp && prev) {
    return {
      cities,
      identities: [...new Set([...prev.identities, ...p.identities])],
      categories: [...new Set([...prev.categories, ...p.categories])],
      topic: prev.topic,
      query: `${prev.topic} ${norm(text)}`,
    }
  }
  return { cities, identities: p.identities, categories: p.categories, topic: norm(text), query: norm(text) }
}
