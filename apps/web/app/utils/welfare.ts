// 與 API 的 WelfareSummary / WelfareDetail 對應（apps/api/src/features/welfare/schema.ts）
export type MatchResult = { light: 'GREEN' | 'YELLOW' | 'RED'; score: number; reasons: string[] }

export type WelfareSummary = {
  id: string
  name: string
  city: string
  categories: string[]
  identities: string[]
  summary: string
  publishedAt: string | null
  deadline: string | null
  match: MatchResult | null
}

export type WelfareList = { data: WelfareSummary[]; meta: { page: number; limit: number; total: number } }

export type WelfareDetail = WelfareSummary & {
  requirements: string[]
  rewards: string[]
  contentMd: string
  sourceUrl: string
  expired: boolean
  attachments: { name: string; url: string }[]
  isFavorite: boolean | null
}

/** 類別的標籤顏色（沿用 v1 的色票） */
export const CATEGORY_COLOR: Record<string, string> = {
  兒童及青少年福利: 'bg-myblue/10 text-myblue',
  婦女與幼兒福利: 'bg-mypurple/10 text-mypurple',
  老人福利: 'bg-myorange/10 text-myorange',
  社會救助福利: 'bg-myred/10 text-myred',
  身心障礙福利: 'bg-myblue-green/10 text-[#00a383]',
  其他福利: 'bg-mygray-100 text-mygray-300',
}
