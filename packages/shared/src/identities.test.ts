import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './categories.ts'
import { IDENTITIES, IDENTITY_COMPATIBILITY, type Identity, satisfiesIdentity } from './identities.ts'

describe('白名單（改動需在 PR 說明理由）', () => {
  it('身分白名單', () => {
    expect(IDENTITIES).toMatchInlineSnapshot(`
      [
        "20歲以下",
        "20歲-65歲",
        "65歲以上",
        "男性",
        "女性",
        "中低收入戶",
        "低收入戶",
        "榮民",
        "身心障礙者",
        "原住民",
        "外籍配偶家庭",
      ]
    `)
  })
  it('相容規則', () => {
    expect(IDENTITY_COMPATIBILITY).toMatchInlineSnapshot(`
      {
        "中低收入戶": [
          "低收入戶",
        ],
      }
    `)
  })
  it('福利類別', () => {
    expect(CATEGORIES).toHaveLength(6)
  })
})

describe('satisfiesIdentity', () => {
  const held = (...xs: Identity[]) => new Set<Identity>(xs)

  it('直接具備', () => {
    expect(satisfiesIdentity('原住民', held('原住民'))).toBe('原住民')
  })
  it('低收入戶也符合中低收入戶的要求', () => {
    expect(satisfiesIdentity('中低收入戶', held('低收入戶'))).toBe('低收入戶')
  })
  it('反向不成立：中低收入戶不符合低收入戶的要求', () => {
    expect(satisfiesIdentity('低收入戶', held('中低收入戶'))).toBeNull()
  })
  it('不具備', () => {
    expect(satisfiesIdentity('榮民', held())).toBeNull()
  })
})
