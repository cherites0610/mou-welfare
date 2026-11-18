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

/**
 * 未滿 20 → 20歲以下；20–64 → 20歲-65歲；年滿 65 → 65歲以上。
 * v1 把剛好 65 歲歸在 20歲-65歲，導致年滿 65 歲的第一年所有老人福利都被判為「年齡不符」
 * （老人福利法以年滿 65 歲為準）。
 */
export function ageGroupOf(age: number): AgeGroup {
  if (age < 20) return '20歲以下'
  if (age < 65) return '20歲-65歲'
  return '65歲以上'
}
