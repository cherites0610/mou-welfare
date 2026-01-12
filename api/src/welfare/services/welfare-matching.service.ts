import { Injectable, Logger } from '@nestjs/common'
import { User } from '../../user/entities/user.entity.js'
import { Welfare } from '../entities/welfare.entity.js'
import { MatchResult, TrafficLight } from '../interfaces/traffic-light.interface.js'

@Injectable()
export class WelfareMatchingService {
  private readonly logger = new Logger(WelfareMatchingService.name)

  private readonly AGE_GROUPS = ['20歲以下', '20歲-65歲', '65歲以上']
  private readonly GENDER_GROUPS = ['男性', '女性']

  private readonly SPECIAL_IDENTITIES = [
    '中低收入戶', '低收入戶', '榮民', '身心障礙者', '原住民', '外籍配偶家庭'
  ]

  private readonly COMPATIBILITY_MAP: Record<string, string[]> = {
    '中低收入戶': ['低收入戶'],
  }

  calculate(user: User, welfare: Welfare): MatchResult {
    this.logger.log(`開始計算福利匹配：使用者 ${user.id}, 福利 ${welfare.id}`)

    const reasons: string[] = []
    let score = 50
    let isRed = false

    let userAge: number | null = null
    if (user.birthday) {
      const birthYear = new Date(user.birthday).getFullYear()
      const currentYear = new Date().getFullYear()
      userAge = currentYear - birthYear
    }

    const userIdentities = new Set([
      ...(user.identities || []),
      ...(user.gender ? [user.gender] : [])
    ])

    if (userAge !== null) {
      if (userAge < 20) userIdentities.add('20歲以下')
      if (userAge >= 20 && userAge <= 65) userIdentities.add('20歲-65歲')
      if (userAge > 65) userIdentities.add('65歲以上')
    }

    const welfareReqs = new Set([
      ...(welfare.identity || [])
    ])

    const checkUserHasIdentity = (reqTag: string): { has: boolean; usedTag?: string } => {
      if (userIdentities.has(reqTag)) return { has: true, usedTag: reqTag }

      const compatibleTags = this.COMPATIBILITY_MAP[reqTag]
      if (compatibleTags) {
        for (const subTag of compatibleTags) {
          if (userIdentities.has(subTag)) {
            return { has: true, usedTag: subTag }
          }
        }
      }

      return { has: false }
    }

    for (const ageTag of this.AGE_GROUPS) {
      if (welfareReqs.has(ageTag) && !userIdentities.has(ageTag)) {
        const hasOtherAge = this.AGE_GROUPS.some(t => t !== ageTag && userIdentities.has(t))
        if (hasOtherAge) {
          isRed = true
          reasons.push(`年齡不符：需「${ageTag}」`)
          this.logger.warn(`匹配衝突：年齡不符，使用者年齡為 ${userAge}`)
        }
      }
    }

    for (const genderTag of this.GENDER_GROUPS) {
      if (welfareReqs.has(genderTag) && !userIdentities.has(genderTag)) {
        const hasOtherGender = this.GENDER_GROUPS.some(t => t !== genderTag && userIdentities.has(t))
        if (hasOtherGender) {
          isRed = true
          reasons.push(`性別不符：需「${genderTag}」`)
          this.logger.warn(`匹配衝突：性別不符，要求為 ${genderTag}`)
        }
      }
    }

    for (const specialTag of this.SPECIAL_IDENTITIES) {
      if (welfareReqs.has(specialTag)) {
        const check = checkUserHasIdentity(specialTag)
        if (!check.has) {
          isRed = true
          reasons.push(`資格不符：需具備「${specialTag}」身份`)
          this.logger.warn(`匹配衝突：缺乏必要身份 ${specialTag}`)
        }
      }
    }

    if (isRed) {
      this.logger.log(`計算結束：結果為紅燈`)
      return { light: TrafficLight.RED, score: 0, reasons }
    }

    let hitCount = 0

    welfareReqs.forEach(req => {
      const check = checkUserHasIdentity(req)
      if (check.has) {
        hitCount++
        if (check.usedTag === req) {
          reasons.push(`符合條件：${req}`)
        } else {
          reasons.push(`符合條件：${req} (由「${check.usedTag}」資格涵蓋)`)
        }
      }
    })

    if (hitCount > 0) {
      score += hitCount * 20
      if (score > 100) score = 100
    }

    let finalLight = TrafficLight.YELLOW

    if (welfareReqs.size === 0) {
      finalLight = TrafficLight.GREEN
      reasons.push('此福利無特殊限制，所有人皆可申請')
      score = 90
    } else if (hitCount > 0) {
      finalLight = TrafficLight.GREEN
    } else {
      reasons.push('無明顯衝突，但未命中特定條件')
      score = 60
    }

    this.logger.log(`計算結束：結果為 ${finalLight}, 分數為 ${score}`)

    return {
      light: finalLight,
      score,
      reasons,
    }
  }
}
