// 主題頁（SEO）：縣市、類別的網址代號與「人生階段」主題。
// 主題用關鍵字比對福利名稱與摘要（PostgreSQL 正規表示式），API 的 topic 篩選與前端的主題頁共用這份定義。
import type { Category } from './categories.ts'
import type { City } from './cities.ts'

export const CITY_SLUGS: Readonly<Record<City, string>> = {
  臺北市: 'taipei',
  新北市: 'new-taipei',
  桃園市: 'taoyuan',
  臺中市: 'taichung',
  臺南市: 'tainan',
  高雄市: 'kaohsiung',
  基隆市: 'keelung',
  新竹市: 'hsinchu-city',
  嘉義市: 'chiayi-city',
  新竹縣: 'hsinchu-county',
  苗栗縣: 'miaoli',
  彰化縣: 'changhua',
  南投縣: 'nantou',
  雲林縣: 'yunlin',
  嘉義縣: 'chiayi-county',
  屏東縣: 'pingtung',
  宜蘭縣: 'yilan',
  花蓮縣: 'hualien',
  臺東縣: 'taitung',
  澎湖縣: 'penghu',
  金門縣: 'kinmen',
  連江縣: 'lienchiang',
}

export const CATEGORY_SLUGS: Readonly<Record<Category, string>> = {
  兒童及青少年福利: 'children',
  婦女與幼兒福利: 'women-infants',
  老人福利: 'elderly',
  社會救助福利: 'social-assistance',
  身心障礙福利: 'disability',
  其他福利: 'other',
}

export type Topic = {
  slug: string
  /** 頁面標題用的短名稱，例如「懷孕生產」 */
  name: string
  /** 一句話說明，放在頁面開頭與 meta description */
  intro: string
  /** 比對福利名稱與摘要的正規表示式（PostgreSQL `~`） */
  pattern: string
}

export const TOPICS = [
  {
    slug: 'pregnancy',
    name: '懷孕生產',
    intro: '懷孕、生產與新生兒相關的補助，例如生育津貼、產檢與坐月子補助。',
    pattern: '生育|生產|懷孕|孕婦|產後|產檢|新生兒|出生',
  },
  {
    slug: 'childcare',
    name: '育兒托育',
    intro: '養育幼兒的補助，例如育兒津貼、托育與托嬰補助。',
    pattern: '育兒|托育|托嬰|保母|育嬰',
  },
  {
    slug: 'education',
    name: '就學助學',
    intro: '學生與家長可申請的補助，例如學雜費減免、助學金與獎學金。',
    pattern: '就學|學雜費|助學|獎學金|教育補助',
  },
  {
    slug: 'housing',
    name: '租屋住宅',
    intro: '租屋、購屋與住宅修繕的補助，例如租金補貼與住宅修繕補助。',
    pattern: '租屋|租金|住宅|購屋|修繕',
  },
  {
    slug: 'social-housing',
    name: '社會住宅',
    intro: '中央與各縣市的社會住宅招租、包租代管，租金低於市價，適合租屋族與弱勢家庭。',
    pattern: '社會住宅|社宅|包租代管',
  },
  {
    slug: 'employment',
    name: '就業與失業',
    intro: '找工作、失業與職業訓練相關的補助與服務。',
    pattern: '失業|就業|職業訓練|職訓',
  },
  {
    slug: 'medical',
    name: '醫療補助',
    intro: '看病、住院與健保相關的補助，例如醫療費用、健保費與看護補助。',
    pattern: '醫療|健保|看護|住院',
  },
  {
    slug: 'senior-allowance',
    name: '敬老金與老人津貼',
    intro: '長輩可以領的錢，例如重陽敬老金、老人生活津貼、國民年金與老農津貼。',
    pattern: '敬老|重陽|老人.*津貼|老年.*(年金|津貼)|老農',
  },
  {
    slug: 'long-term-care',
    name: '長照與照顧',
    intro: '長期照顧、居家照顧與照顧者喘息服務的補助。',
    pattern: '長照|長期照顧|居家照顧|喘息|照顧服務',
  },
  {
    slug: 'assistive-devices',
    name: '輔具補助',
    intro: '購買或租借輔具的補助，例如輪椅、助聽器與居家無障礙設施。',
    pattern: '輔具|助聽器|輪椅|無障礙',
  },
  {
    slug: 'transport',
    name: '交通乘車',
    intro: '搭車與交通相關的優惠與補助，例如敬老卡、愛心卡與復康巴士。',
    pattern: '交通|乘車|敬老卡|愛心卡|復康巴士|計程車',
  },
  {
    slug: 'emergency',
    name: '急難救助',
    intro: '突然遇到變故、生活陷入困難時可申請的急難救助與紓困。',
    pattern: '急難|紓困|災害|救助金',
  },
  {
    slug: 'funeral',
    name: '喪葬補助',
    intro: '家人過世時可申請的喪葬補助與殯葬服務。',
    pattern: '喪葬|殯葬',
  },
] as const satisfies readonly Topic[]

export type TopicSlug = (typeof TOPICS)[number]['slug']
export const TOPIC_SLUGS = TOPICS.map((t) => t.slug) as [TopicSlug, ...TopicSlug[]]

const invert = <K extends string>(m: Readonly<Record<K, string>>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>
const CITY_BY_SLUG = invert(CITY_SLUGS)
const CATEGORY_BY_SLUG = invert(CATEGORY_SLUGS)

export const cityFromSlug = (slug: string): City | undefined => CITY_BY_SLUG[slug]
export const categoryFromSlug = (slug: string): Category | undefined => CATEGORY_BY_SLUG[slug]
export const topicFromSlug = (slug: string) => TOPICS.find((t) => t.slug === slug)
