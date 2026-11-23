// 送進 LLM 的內容（docs/backend.md §8.9）與回答的後處理。
// 個資：只送問題、公開的福利內容、粗略條件（年齡層、縣市、身分標籤）；不送姓名、email、生日。
import { ageGroupOf, ageOn, type MatchProfile } from '@mou-welfare/shared'
import type { Message } from '../../lib/llm/index.ts'
import type { FamilyProfile } from '../family/service.ts'
import type { ChatFilters } from './parse.ts'
import type { Source } from './retrieve.ts'

/** 帶進 prompt 的對話輪數（使用者與助理各算一則） */
export const HISTORY_MESSAGES = 6

const LIGHT_TEXT = { GREEN: '可能符合', YELLOW: '資料不足，無法確認', RED: '可能不符合' } as const

export const SYSTEM_PROMPT = `你是「阿哞」，哞福利網站的福利小幫手，用繁體中文（台灣用語）回答台灣政府福利的問題。

規則：
1. 只能根據下方「找到的福利」回答，不要自己補充其他福利、金額、日期或申請方式。資料裡沒有的就說不確定，請使用者看原公告或洽承辦單位（各縣市社會局處、區公所）。
2. 第一次提到某一筆福利時，在福利名稱後面標註它的編號，例如「可以申請生育補助[[1]]」；同一筆不要重複標註。只能用下方列出的編號。
3. 每筆福利附有對使用者的資格比對（可能符合／可能不符合／資料不足），回答時要考慮：先介紹可能符合的；可能不符合的要說明原因。比對只是初步判斷，不要保證一定符合。
4. 如果找到的福利和問題無關，直接說目前沒有找到相關的福利，建議換個問法或到福利列表搜尋，不要硬湊。
5. 問題和政府福利無關時，簡短說明你只能回答福利相關問題。
6. 回答簡潔：先一兩句總結，再用條列說明重點（資格、補助內容、截止日）。不超過 300 字。不要用表格。
7. 不要詢問或要求使用者提供姓名、身分證字號、電話等個人資料。`

function ageGroup(p: MatchProfile, today: Date) {
  return p.birthday ? ageGroupOf(ageOn(new Date(`${p.birthday}T00:00:00Z`), today)) : null
}

function describePerson(label: string, p: MatchProfile, today: Date) {
  const parts = [ageGroup(p, today), p.gender, ...(p.identities ?? [])].filter(Boolean)
  return `${label}：${parts.length ? parts.join('、') : '沒有填寫'}`
}

export function buildPrompt(opts: {
  question: string
  history: Message[]
  filters: ChatFilters
  sources: Source[]
  profile: MatchProfile | null
  family: FamilyProfile[] | null
  /** 篩選的縣市目前沒有資料，改列其他縣市 */
  cityMissing: boolean
  today?: Date
}): { system: string; messages: Message[] } {
  const today = opts.today ?? new Date()
  const f = opts.filters
  const ctx: string[] = []
  ctx.push(`縣市：${f.cities.length ? f.cities.join('、') : '不限'}${opts.cityMissing ? '（這個縣市目前還沒有收錄資料，下面是其他縣市的福利，回答時要先說明）' : ''}`)
  if (f.identities.length) ctx.push(`問題提到的身分：${f.identities.join('、')}`)
  if (opts.profile) ctx.push(describePerson('使用者的個人資料', opts.profile, today))
  else ctx.push('使用者沒有套用個人資料，資格比對無法判斷')
  opts.family?.forEach((m, i) => ctx.push(describePerson(`家人 ${i + 1}`, m, today)))

  const programs = opts.sources.map((s, i) => {
    const lines = [`[[${i + 1}]] ${s.name}（${s.city}）`, `摘要：${s.summary}`]
    if (s.requirements.length) lines.push(`資格：${s.requirements.join('；')}`)
    if (s.rewards.length) lines.push(`補助內容：${s.rewards.join('；')}`)
    if (s.deadline) lines.push(`截止日：${s.deadline}`)
    if (s.match) lines.push(`對使用者的比對：${LIGHT_TEXT[s.match.light]}（${s.match.reasons.join('；')}）`)
    s.familyMatches?.forEach((fm, j) => lines.push(`對家人 ${j + 1} 的比對：${LIGHT_TEXT[fm.match.light]}`))
    return lines.join('\n')
  })

  const system = `${SYSTEM_PROMPT}

今天：${today.toISOString().slice(0, 10)}
條件：
${ctx.map((c) => `- ${c}`).join('\n')}

找到的福利：
${programs.length ? programs.join('\n\n') : '（沒有）'}`
  return { system, messages: [...opts.history.slice(-HISTORY_MESSAGES), { role: 'user', content: opts.question }] }
}

/**
 * 串流時把 [[編號]] 換成 [[福利 id]]，不在清單內的編號直接移除。
 * 「[[」可能被切在兩個 chunk 之間，所以結尾可能是標註開頭的部分先留著，下一段再處理。
 */
export class CitationRewriter {
  private pending = ''
  constructor(private readonly ids: string[]) {}

  push(chunk: string): string {
    const text = this.pending + chunk
    // 結尾的「[」「[[」「[[12」「[[12]」都可能是還沒完成的標註
    const tail = /\[(?:\[\d{0,2}\]?)?$/.exec(text)
    const cut = tail ? tail.index : text.length
    this.pending = text.slice(cut)
    return this.rewrite(text.slice(0, cut))
  }

  flush(): string {
    const out = this.rewrite(this.pending)
    this.pending = ''
    return out
  }

  private rewrite(s: string): string {
    return s.replace(/\[\[(\d{1,2})\]\]/g, (_m, n: string) => {
      const id = this.ids[Number(n) - 1]
      return id ? `[[${id}]]` : ''
    })
  }
}

export const EMPTY_TEXT = '目前沒有找到相關的福利。可以換個說法再問一次，或到福利列表用關鍵字搜尋。'

/** LLM 不可用（沒有金鑰、額度暫停、逾時或錯誤）時的固定格式回答 */
export function fallbackText(sources: Source[], cityMissing: boolean): string {
  if (!sources.length) return EMPTY_TEXT
  const head = 'AI 暫時無法回覆，以下是依你的條件找到的福利：'
  const note = cityMissing ? '\n\n（你的縣市目前還沒有收錄資料，以下是其他縣市的福利，僅供參考。）' : ''
  return `${head}${note}\n\n${sources.map((s) => `- ${s.name}（${s.city}）[[${s.id}]]`).join('\n')}\n\n點下方的福利卡可以看詳細資格與申請方式。`
}
