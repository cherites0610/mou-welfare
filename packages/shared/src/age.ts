import type { AgeGroup } from './identities.ts'

/** 足歲年齡：以完整生日計算（v1 只用年份相減，生日前會多算一歲 → 回歸測試 R5）。 */
export function ageOn(birthday: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthday.getUTCFullYear()
  const beforeBirthday =
    today.getUTCMonth() < birthday.getUTCMonth() ||
    (today.getUTCMonth() === birthday.getUTCMonth() && today.getUTCDate() < birthday.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

/** 與 v1 規則一致：未滿 20 → 20歲以下；20–65（含 65）→ 20歲-65歲；超過 65 → 65歲以上。 */
export function ageGroupOf(age: number): AgeGroup {
  if (age < 20) return '20歲以下'
  if (age <= 65) return '20歲-65歲'
  return '65歲以上'
}
