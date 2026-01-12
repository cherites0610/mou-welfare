import { Welfare } from '../entities/welfare.entity.js'
import { MatchResult } from './traffic-light.interface.js'

export interface WelfareResponse extends Welfare {
  // 個人/模擬模式的結果
  match?: MatchResult

  // 家庭模式的結果
  familyMatches?: {
    userId: string
    name: string // 方便前端顯示 (e.g., 爸爸, 媽媽)
    avatarUrl: string
    match: MatchResult
  }[]

  // 家庭模式的綜合燈號 (用於排序或概覽)
  overallScore?: number
}
