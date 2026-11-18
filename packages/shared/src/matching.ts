// 資格比對（紅黃綠燈，docs/backend.md §8.1）。純函式，前後端共用；分支覆蓋率要求 100%。
// 規則沿用 v1，修正：年齡以完整生日計算（R5）。
import { ageGroupOf, ageOn } from './age.ts'
import { AGE_GROUPS, GENDERS, type Identity, IDENTITIES, SPECIAL_IDENTITIES, satisfiesIdentity } from './identities.ts'

export type Light = 'GREEN' | 'YELLOW' | 'RED'

export type MatchResult = { light: Light; score: number; reasons: string[] }

export type MatchProfile = {
  /** YYYY-MM-DD */
  birthday?: string | null
  gender?: string | null
  identities?: readonly string[] | null
}

const isIdentity = (x: string): x is Identity => (IDENTITIES as readonly string[]).includes(x)

/** 使用者實際具備的身分：自填的特殊身分 + 性別 + 由生日推得的年齡組 */
export function heldIdentities(profile: MatchProfile, today: Date): Set<Identity> {
  const held = new Set<Identity>((profile.identities ?? []).filter(isIdentity))
  if (profile.gender && isIdentity(profile.gender)) held.add(profile.gender)
  if (profile.birthday) {
    held.add(ageGroupOf(ageOn(new Date(`${profile.birthday}T00:00:00Z`), today)))
  }
  return held
}

export function match(profile: MatchProfile, required: readonly string[], today: Date = new Date()): MatchResult {
  const held = heldIdentities(profile, today)
  const reqs = required.filter(isIdentity)
  const reasons: string[] = []

  // 1. 衝突：年齡、性別已知但不符；特殊身分不具備
  for (const group of [AGE_GROUPS, GENDERS] as const) {
    const req = reqs.filter((r) => (group as readonly string[]).includes(r))
    const mine = [...held].filter((h) => (group as readonly string[]).includes(h))
    if (req.length > 0 && mine.length > 0 && !req.some((r) => mine.includes(r))) {
      reasons.push(`${group === AGE_GROUPS ? '年齡' : '性別'}不符：需「${req.join('、')}」`)
    }
  }
  for (const r of reqs) {
    if ((SPECIAL_IDENTITIES as readonly string[]).includes(r) && !satisfiesIdentity(r, held)) {
      reasons.push(`資格不符：需具備「${r}」身分`)
    }
  }
  if (reasons.length > 0) return { light: 'RED', score: 0, reasons }

  // 2. 無衝突：沒有身分限制 → 綠；有命中 → 綠（依命中數加分）；都未知 → 黃
  if (reqs.length === 0) return { light: 'GREEN', score: 90, reasons: ['此福利無特殊身分限制'] }

  let hits = 0
  for (const r of reqs) {
    const used = satisfiesIdentity(r, held)
    if (used) {
      hits++
      reasons.push(used === r ? `符合條件：${r}` : `符合條件：${r}（由「${used}」資格涵蓋）`)
    }
  }
  if (hits === 0) return { light: 'YELLOW', score: 60, reasons: ['無明顯衝突，但個人資料不足以確認資格'] }
  return { light: 'GREEN', score: Math.min(100, 50 + hits * 20), reasons }
}
