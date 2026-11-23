// 福利結構化（docs/backend.md §8.3）：爬蟲送來的正文 → 摘要、類別、身分、資格、補助內容、截止日。
// 有 Gemini 金鑰時用 LLM；沒有時用關鍵字規則，讓資料先可以被搜尋到，之後有金鑰再重新結構化。
import { AGE_GROUPS, CATEGORIES, type Category, GENDERS, IDENTITIES, type Identity } from '@mou-welfare/shared'
import { createHash } from 'node:crypto'
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

/**
 * 交給 LLM 的格式：身分不直接列，而是逐一附上原文依據並判斷「沒有這個身分是否也能申請」，
 * 只採用不能替代的（docs/backend.md §8.3.1：直接列時常把擇一的條件或標題上的詞當成必備）。
 */
export const LLMStructuredWelfare = StructuredWelfare.omit({ identities: true }).extend({
  identityChecks: z
    .array(
      z.object({
        identity: z.enum(IDENTITIES),
        quote: z.string().max(300).describe('原文中提到這個身分的申請資格句子，照抄'),
        canApplyWithout: z
          .boolean()
          .describe('沒有這個身分的人是否也可能符合資格（擇一、另有替代資格、門檻不同、只是加碼或優先對象時為 true）'),
      }),
    )
    .max(8)
    .describe('原文申請資格中提到的候選身分，逐一判斷；沒有就給空陣列'),
})
export type LLMStructuredWelfare = z.infer<typeof LLMStructuredWelfare>

export type StructureInput = {
  /** 用量紀錄用（llm_calls.program_id）；回測時沒有 */
  programId?: string
  title: string
  city: string
  contentMd: string
  attachments: { name: string; text: string }[]
  sourceFields: Record<string, unknown>
}

export type StructureResult = StructuredWelfare & { by: 'llm' | 'rules'; model?: string; promptVersion?: string }

export interface Structurer {
  readonly kind: 'llm' | 'rules'
  structure(input: StructureInput): Promise<StructureResult>
}

const MAX_INPUT_CHARS = 16_000

export const SYSTEM_PROMPT = `你是台灣政府福利資料的整理員。輸入是一篇縣市政府網站上的福利公告（Markdown）與附件文字，請依 JSON schema 輸出。
規則：
- 只根據輸入內容，不要推測或補充沒寫的資訊；資格與金額照原文的數字與條件寫。
- categories 從清單中選最相關的 1–3 個；都不適合用「其他福利」。
- identityChecks：列出申請資格中提到的候選身分（選項：${IDENTITIES.join('、')}），每個都照抄原文依據，並判斷 canApplyWithout。
  只有 canApplyWithout 為 false 的身分會被當成「每一個申請人都一定要具備」。寧可判為 true：誤判為必備會讓符合資格的人被誤判為不符合。
  以下規則說明哪些情況必備（false）、哪些不是（true）；寫「不要列」「不列」的，就是 canApplyWithout 為 true（或不列入候選）：
  - 列出的身分會被視為「全部都要具備」。原文寫「符合下列其一」「A 或 B」「A、B 擇一」時，這些選項都不要列。
    例：「領有身心障礙證明，且為低收入戶、中低收入戶或領有生活補助費其中之一」→ 只列「身心障礙者」。
  - 不要因為標題或名稱有某個詞就列，要看申請資格怎麼寫。
  - 中低收入戶：只在原文要求「列冊低收入戶或中低收入戶」而且沒有其他替代資格時列（低收入戶自動符合，所以「低收入戶或中低收入戶」只列「中低收入戶」）。
    以下都不列：「中低收入老人生活津貼」「身心障礙者生活補助」的資格或領取者（這些是另外審核的津貼，不等於中低收入戶）；
    只寫家庭收入或財產標準；中低收入戶只是幾種替代資格之一（例如「低收、中低收或領有中低收入老人生活津貼」）。
  - 身心障礙者：原文要求領有身心障礙證明（手冊）才列；「身障證明或醫師診斷」這類可替代時不列。
  - 外籍配偶家庭：對象限新住民、外籍或大陸配偶及其家庭時列。
  - 年齡（依序判斷）：
    1. 給兒童或幼兒、通常由家長或家屬申請或通報的（托育、早療、發展遲緩、生育、兒童補助），不要列年齡。
    2. 有替代條件（例如「65 歲以上或 55 歲以上原住民」「老人或身心障礙者」）、門檻跨越多個年齡層（例如「未滿 65 歲」「6 至 30 歲」）、門檻不是 65 或 20（例如「年滿 60 歲」）或沒有明確門檻時，不要列年齡。
    3. 其餘只在門檻正好對應一個年齡層時列一個：年滿 65 歲 → 65歲以上；由青少年本人申請、限未滿 20 歲 → 20歲以下。
  - 年齡、性別若不必備，也可以不列出。沒有任何候選身分就給空陣列。
- isIndividualWelfare：看服務對象是不是一般民眾或家庭。
  - true：直接提供給民眾或家庭的補助、津貼、服務、諮詢、陪伴、安置（例如家暴相對人支持服務、兒少與家庭支持方案）。
  - false：對象是社工人員、機構或團體（機構評鑑、設置管理、補助民間團體、人員訓練），或不是可申請的項目（宣導影片、調查報告、捐款名冊、會議紀錄、採購、團體名冊、法規全文）。`

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

/**
 * prompt 與輸出格式的版本：內容一改就變，寫進 llm_calls 與 welfare_programs，事後才知道每筆是哪一版做的。
 * 只看 prompt 與 schema；改 buildInput 不會變（需要時手動調整這裡的後綴）。
 */
export const PROMPT_VERSION = createHash('sha256')
  .update(SYSTEM_PROMPT)
  .update(JSON.stringify(z.toJSONSchema(LLMStructuredWelfare)))
  .digest('hex')
  .slice(0, 12)

export class LLMStructurer implements Structurer {
  readonly kind = 'llm' as const
  constructor(private readonly llm: LLM) {}

  async structure(input: StructureInput): Promise<StructureResult> {
    const { identityChecks, ...out } = await this.llm.generate({
      system: SYSTEM_PROMPT,
      input: buildInput(input),
      schema: LLMStructuredWelfare,
      meta: { purpose: 'structure', programId: input.programId, promptVersion: PROMPT_VERSION },
    })
    const identities = identityChecks.filter((c) => !c.canApplyWithout && hasEvidence(c)).map((c) => c.identity)
    return {
      ...out,
      identities: sanitizeIdentities([...new Set(identities)]),
      by: 'llm',
      model: this.llm.model,
      promptVersion: PROMPT_VERSION,
    }
  }
}

/**
 * 依據句子裡要有該身分的關鍵字才採用。模型常拿標題或「中低收入獨居老人」「符合中低收入老人生活津貼規定」
 * 這類不含身分本身的句子當依據（docs/backend.md §8.3.1）。
 */
const EVIDENCE: Record<Identity, RegExp> = {
  '20歲以下': /未滿\s*(?:20|二十)\s*歲|20\s*歲以下|二十歲以下/,
  '20歲-65歲': /(?:20|二十)\s*歲.*(?:65|六十五)\s*歲/,
  '65歲以上': /65|六十五/,
  男性: /男/,
  女性: /女|婦|孕|產/,
  // 「中低收入老人（生活津貼）」「中低收入獨居老人」不算
  中低收入戶: /低收入戶|低收(?!入(?:老人|獨居))/,
  低收入戶: /低收入戶|低收(?!入(?:老人|獨居))/,
  榮民: /榮民/,
  身心障礙者: /身心障礙|身障|障礙/,
  原住民: /原住民/,
  外籍配偶家庭: /新住民|外籍|大陸|配偶|外配/,
}
export function hasEvidence(c: { identity: Identity; quote: string }): boolean {
  return EVIDENCE[c.identity].test(c.quote)
}

/**
 * 身分會被當成「全部都要具備」，所以同時要求兩個年齡層或兩個性別的組合沒有人能符合，會讓所有人看到紅燈。
 * prompt 已要求不要這樣標，這裡再擋一次：同類出現兩個以上就整類拿掉（寧可少標）。
 * 「低收入戶＋中低收入戶」只留「中低收入戶」（低收入戶自動符合）。
 */
export function sanitizeIdentities(ids: Identity[]): Identity[] {
  const set = new Set(ids)
  for (const group of [AGE_GROUPS, GENDERS] as const) {
    if (group.filter((g) => set.has(g)).length > 1) for (const g of group) set.delete(g)
  }
  if (set.has('中低收入戶')) set.delete('低收入戶')
  return [...set]
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
