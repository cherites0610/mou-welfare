// 福利結構化（docs/backend.md §8.3）：爬蟲送來的正文 → 摘要、類別、身分、資格、補助內容、截止日。
// 有 Gemini 金鑰時用 LLM；沒有時用關鍵字規則，讓資料先可以被搜尋到，之後有金鑰再重新結構化。
import { CATEGORIES, type Category, IDENTITIES, type Identity } from '@mou-welfare/shared'
import { z } from 'zod'
import type { LLM } from '../../lib/llm/index.ts'

export const StructuredWelfare = z.object({
  isIndividualWelfare: z
    .boolean()
    .describe('是否為「個人或家庭可以申請」的福利、補助或服務；機構管理、團體補助、宣導、報告、會議、名冊都是 false'),
  name: z.string().min(2).max(60).describe('福利名稱，去掉年度、縣市名與「公告」等字'),
  summary: z.string().min(10).max(200).describe('一到兩句話說明給誰、提供什麼，不超過 100 字'),
  categories: z.array(z.enum(CATEGORIES)).min(1).max(3),
  identities: z.array(z.enum(IDENTITIES)).max(6),
  requirements: z.array(z.string().min(2).max(200)).max(8).describe('申請資格，每項一句'),
  rewards: z.array(z.string().min(2).max(200)).max(8).describe('補助金額或服務內容，每項一句'),
  deadline: z.iso.date().nullable().describe('申請截止日（YYYY-MM-DD）；常年受理或沒寫就是 null'),
})
export type StructuredWelfare = z.infer<typeof StructuredWelfare>

export type StructureInput = {
  title: string
  city: string
  contentMd: string
  attachments: { name: string; text: string }[]
  sourceFields: Record<string, unknown>
}

export type StructureResult = StructuredWelfare & { by: 'llm' | 'rules' }

export interface Structurer {
  readonly kind: 'llm' | 'rules'
  structure(input: StructureInput): Promise<StructureResult>
}

const MAX_INPUT_CHARS = 16_000

export const SYSTEM_PROMPT = `你是台灣政府福利資料的整理員。輸入是一篇縣市政府網站上的福利公告（Markdown）與附件文字，請依 JSON schema 輸出。
規則：
- 只根據輸入內容，不要推測或補充沒寫的資訊；資格與金額照原文的數字與條件寫。
- categories 從清單中選最相關的 1–3 個；都不適合用「其他福利」。
- identities 只列「申請人一定要具備」的身分，選項：${IDENTITIES.join('、')}。
  - 多個特殊身分會被視為「全部都要具備」；若原文是「A 或 B 其中之一」就都不要列。
  - 「低收入戶或中低收入戶」只列「中低收入戶」（低收入戶自動符合）。
  - 年齡只在有明確年齡門檻時列（例如年滿 65 歲 → 65歲以上）；給兒童的福利但由家長申請時不要列年齡。
  - 沒有身分限制就給空陣列。
- isIndividualWelfare：機構評鑑、設置管理、補助民間團體、宣導影片、調查報告、捐款名冊、會議紀錄、採購等都是 false。`

export function buildInput(input: StructureInput): string {
  const fields = Object.entries(input.sourceFields)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `- ${k}：${String(v)}`)
    .join('\n')
  const attachments = input.attachments
    .filter((a) => a.text.trim())
    .map((a) => `### 附件：${a.name}\n${a.text}`)
    .join('\n\n')
  const text = [
    `縣市：${input.city}`,
    `標題：${input.title}`,
    fields && `## 原始欄位\n${fields}`,
    `## 正文\n${input.contentMd}`,
    attachments && `## 附件\n${attachments}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return text.slice(0, MAX_INPUT_CHARS)
}

export class LLMStructurer implements Structurer {
  readonly kind = 'llm' as const
  constructor(private readonly llm: LLM) {}

  async structure(input: StructureInput): Promise<StructureResult> {
    const out = await this.llm.generate({ system: SYSTEM_PROMPT, input: buildInput(input), schema: StructuredWelfare })
    return { ...out, by: 'llm' }
  }
}

// ---- 沒有 LLM 時的關鍵字規則：寧可少標，不要標錯（身分標錯會讓使用者看到錯誤的紅燈） ----

const CATEGORY_RULES: [Category, RegExp][] = [
  ['身心障礙福利', /身心障礙|身障|障礙者|輔具|復康巴士|手語/],
  ['老人福利', /老人|長者|長青|敬老|銀髮|65歲以上|失智/],
  ['兒童及青少年福利', /兒童|少年|兒少|未成年|學童|育兒|托育|托嬰|早期療育/],
  ['婦女與幼兒福利', /婦女|生育|孕|產婦|坐月子|特殊境遇|單親|新生兒/],
  ['社會救助福利', /低收入|中低收入|急難|救助|紓困|弱勢|災害|以工代賑|實物銀行|遊民|脫貧/],
]

// 只看標題：正文常提到其他身分（例如「低收入戶免附」），用來判斷身分容易出錯
const IDENTITY_RULES: [Identity, RegExp][] = [
  ['身心障礙者', /身心障礙|身障|障礙者|視障|聽障|精神障礙/],
  ['原住民', /原住民/],
  ['榮民', /榮民/],
  ['外籍配偶家庭', /新住民|外籍配偶|外配/],
  ['65歲以上', /老人|長者|敬老|65歲以上/],
  ['女性', /婦女/],
]

const META_LINE = /^(?:[-*]\s*)?(?:日期|發[布佈]日期|發[布佈]單位|聯絡人|聯絡資訊|聯絡電話|資料來源|類\s*別|網頁維護|截止日期|詳細內容)\s*[：:]/

function summarize(contentMd: string): string {
  const lines = contentMd
    .split('\n')
    .map((l) => l.replace(/^[-*#>|\s]+/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length >= 8 && !META_LINE.test(l) && !l.startsWith('附件：'))
  const text = lines.join(' ').replace(/\s+/g, ' ')
  return text.length > 120 ? `${text.slice(0, 118)}…` : text
}

export class RuleStructurer implements Structurer {
  readonly kind = 'rules' as const

  async structure(input: StructureInput): Promise<StructureResult> {
    const haystack = `${input.title}\n${input.contentMd.slice(0, 2000)}`
    const categories = CATEGORY_RULES.filter(([, re]) => re.test(input.title)).map(([c]) => c)
    if (!categories.length) categories.push(...CATEGORY_RULES.filter(([, re]) => re.test(haystack)).map(([c]) => c))
    const identities = new Set<Identity>(IDENTITY_RULES.filter(([, re]) => re.test(input.title)).map(([i]) => i))
    if (/中低收入/.test(input.title)) identities.add('中低收入戶')
    else if (/低收入/.test(input.title)) identities.add('低收入戶')
    // 「老人及身心障礙者」這類標題是「其中之一」，不能當成兩個都要具備
    if (/[及與或、]/.test(input.title) && identities.has('65歲以上') && identities.has('身心障礙者')) {
      identities.delete('65歲以上')
      identities.delete('身心障礙者')
    }
    const summary = summarize(input.contentMd) || input.title
    return {
      isIndividualWelfare: true, // 爬蟲已用標題規則排除明顯的雜訊；精確判斷交給 LLM
      name: input.title.slice(0, 60),
      summary: summary.length >= 10 ? summary : `${input.title}（詳見原文）`,
      categories: (categories.length ? categories.slice(0, 3) : ['其他福利']) as Category[],
      identities: [...identities],
      requirements: [],
      rewards: [],
      deadline: null,
      by: 'rules',
    }
  }
}
