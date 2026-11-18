import { describe, expect, it } from 'vitest'
import { heldIdentities, match } from './matching.ts'

const TODAY = new Date('2026-11-18T00:00:00Z')
const elder = { birthday: '1950-01-01', gender: '女性', identities: ['中低收入戶'] }

describe('heldIdentities', () => {
  it('合併自填身分、性別與年齡組，忽略白名單外的值', () => {
    const held = heldIdentities({ birthday: '1950-01-01', gender: '女性', identities: ['原住民', '外星人'] }, TODAY)
    expect([...held].sort()).toEqual(['65歲以上', '原住民', '女性'].sort())
  })
  it('沒有任何資料時為空集合', () => {
    expect(heldIdentities({}, TODAY).size).toBe(0)
    expect(heldIdentities({ birthday: null, gender: null, identities: null }, TODAY).size).toBe(0)
  })
})

describe('match：紅燈（衝突）', () => {
  it('年齡已知但不符', () => {
    const r = match({ birthday: '2000-01-01' }, ['65歲以上'], TODAY)
    expect(r).toEqual({ light: 'RED', score: 0, reasons: ['年齡不符：需「65歲以上」'] })
  })
  it('性別已知但不符', () => {
    expect(match({ gender: '男性' }, ['女性'], TODAY).light).toBe('RED')
  })
  it('缺少特殊身分', () => {
    const r = match({ identities: [] }, ['身心障礙者'], TODAY)
    expect(r.reasons).toEqual(['資格不符：需具備「身心障礙者」身分'])
  })
  it('中低收入戶不符合低收入戶的要求（相容規則只單向）', () => {
    expect(match({ identities: ['中低收入戶'] }, ['低收入戶'], TODAY).light).toBe('RED')
  })
  it('多個衝突全部列出', () => {
    const r = match({ birthday: '2000-01-01', gender: '男性' }, ['65歲以上', '女性', '榮民'], TODAY)
    expect(r.reasons).toHaveLength(3)
  })
})

describe('match：綠燈', () => {
  it('沒有身分限制', () => {
    expect(match({}, [], TODAY)).toEqual({ light: 'GREEN', score: 90, reasons: ['此福利無特殊身分限制'] })
  })
  it('命中一個條件：50 + 20', () => {
    expect(match(elder, ['65歲以上'], TODAY)).toEqual({ light: 'GREEN', score: 70, reasons: ['符合條件：65歲以上'] })
  })
  it('由相容身分涵蓋', () => {
    const r = match({ identities: ['低收入戶'] }, ['中低收入戶'], TODAY)
    expect(r.reasons).toEqual(['符合條件：中低收入戶（由「低收入戶」資格涵蓋）'])
  })
  it('分數上限 100', () => {
    expect(match(elder, ['65歲以上', '女性', '中低收入戶'], TODAY).score).toBe(100)
  })
  it('年齡要求可為多個年齡組之一', () => {
    expect(match({ birthday: '1950-01-01' }, ['20歲-65歲', '65歲以上'], TODAY).light).toBe('GREEN')
  })
  it('忽略白名單外的要求', () => {
    expect(match({}, ['不存在的身分'], TODAY).light).toBe('GREEN')
  })
})

describe('match：黃燈（資料不足）', () => {
  it('有年齡限制但沒填生日', () => {
    expect(match({}, ['65歲以上'], TODAY)).toEqual({
      light: 'YELLOW',
      score: 60,
      reasons: ['無明顯衝突，但個人資料不足以確認資格'],
    })
  })
})

describe('R5 邊界：年滿 65 歲當天起符合老人福利', () => {
  it('生日前一天（64 歲）：65歲以上的福利為紅燈', () => {
    expect(match({ birthday: '1961-11-19' }, ['65歲以上'], TODAY).light).toBe('RED')
  })
  it('生日當天（65 歲）：65歲以上的福利為綠燈', () => {
    expect(match({ birthday: '1961-11-18' }, ['65歲以上'], TODAY).light).toBe('GREEN')
  })
  it('預設今天日期也能運作', () => {
    expect(match({}, []).light).toBe('GREEN')
  })
})
