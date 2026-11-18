import { describe, expect, it } from 'vitest'
import { ageGroupOf, ageOn } from './age.ts'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('R5 年齡：以完整生日計算', () => {
  it('生日前一天尚未滿 65 歲', () => {
    expect(ageOn(d('1961-11-19'), d('2026-11-18'))).toBe(64)
  })
  it('生日當天滿 65 歲', () => {
    expect(ageOn(d('1961-11-18'), d('2026-11-18'))).toBe(65)
  })
  it('生日後一天仍是 65 歲', () => {
    expect(ageOn(d('1961-11-17'), d('2026-11-18'))).toBe(65)
  })
  it('跨年：12 月生日在 1 月時尚未過生日', () => {
    expect(ageOn(d('2006-12-31'), d('2026-01-01'))).toBe(19)
  })
  it('2/29 生日在平年 2/28 尚未滿歲', () => {
    expect(ageOn(d('2004-02-29'), d('2025-02-28'))).toBe(20)
    expect(ageOn(d('2004-02-29'), d('2024-02-28'))).toBe(19)
  })
})

describe('年齡組（沿用 v1 邊界）', () => {
  it.each([
    [19, '20歲以下'],
    [20, '20歲-65歲'],
    [65, '20歲-65歲'],
    [66, '65歲以上'],
  ] as const)('%i 歲 → %s', (age, group) => {
    expect(ageGroupOf(age)).toBe(group)
  })

  it('R5 生日前一天：64 歲仍屬 20歲-65歲，生日當天 65 歲也屬 20歲-65歲', () => {
    expect(ageGroupOf(ageOn(d('1961-11-19'), d('2026-11-18')))).toBe('20歲-65歲')
    expect(ageGroupOf(ageOn(d('1960-11-19'), d('2026-11-18')))).toBe('20歲-65歲')
    expect(ageGroupOf(ageOn(d('1960-11-18'), d('2026-11-18')))).toBe('65歲以上')
  })
})
