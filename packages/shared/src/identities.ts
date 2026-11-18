// 身分白名單：LLM 結構化、資格比對、前端篩選共用同一份定義。
// 改動時 identities.test.ts 的快照會失敗，必須在 PR 說明理由。

export const AGE_GROUPS = ['20歲以下', '20歲-65歲', '65歲以上'] as const
export const GENDERS = ['男性', '女性'] as const
export const SPECIAL_IDENTITIES = [
  '中低收入戶',
  '低收入戶',
  '榮民',
  '身心障礙者',
  '原住民',
  '外籍配偶家庭',
] as const

export const IDENTITIES = [...AGE_GROUPS, ...GENDERS, ...SPECIAL_IDENTITIES] as const

export type AgeGroup = (typeof AGE_GROUPS)[number]
export type Gender = (typeof GENDERS)[number]
export type Identity = (typeof IDENTITIES)[number]

/**
 * 相容規則：key 為福利要求的身分，value 為「也符合該要求」的其他身分。
 * 例：福利要求「中低收入戶」時，低收入戶也符合。
 */
export const IDENTITY_COMPATIBILITY: Readonly<Partial<Record<Identity, readonly Identity[]>>> = {
  中低收入戶: ['低收入戶'],
}

export function satisfiesIdentity(required: Identity, held: ReadonlySet<Identity>): Identity | null {
  if (held.has(required)) return required
  for (const alt of IDENTITY_COMPATIBILITY[required] ?? []) {
    if (held.has(alt)) return alt
  }
  return null
}
