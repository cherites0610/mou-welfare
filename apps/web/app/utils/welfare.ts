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
  /** 帶 familyId 時才有：家人（不含自己）的比對結果 */
  familyMatches?: FamilyMatch[] | null
}

export type FamilyMatch = { userId: string; name: string; image: string | null; match: MatchResult }

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

/** 身分標籤顏色（沿用 v1 web/src/composables/useTagColor.ts） */
const TAG_COLOR: Record<string, string> = {
  '20歲以下': 'bg-myorange',
  '20歲-65歲': 'bg-myorange',
  '65歲以上': 'bg-myorange',
  男性: 'bg-myblue',
  女性: 'bg-myblue',
  中低收入戶: 'bg-mypurple',
  低收入戶: 'bg-mypurple',
  榮民: 'bg-myblue-green',
  身心障礙者: 'bg-myblue-green',
  原住民: 'bg-myblue-green',
  外籍配偶家庭: 'bg-myblue-green',
}

export const getTagColor = (tag: string) => TAG_COLOR[tag] || 'bg-gray-400'
