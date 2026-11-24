import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './categories.ts'
import { CITIES } from './cities.ts'
import { CATEGORY_SLUGS, CITY_SLUGS, categoryFromSlug, cityFromSlug, TOPIC_SLUGS, TOPICS, topicFromSlug } from './topics.ts'

const slug = /^[a-z]+(-[a-z]+)*$/

describe('主題頁的網址代號', () => {
  it('每個縣市、類別都有唯一的代號，而且可以反查', () => {
    for (const [all, slugs, from] of [
      [CITIES, CITY_SLUGS, cityFromSlug],
      [CATEGORIES, CATEGORY_SLUGS, categoryFromSlug],
    ] as const) {
      const values = all.map((x) => (slugs as Record<string, string>)[x]!)
      expect(new Set(values).size).toBe(all.length)
      for (const [i, s] of values.entries()) {
        expect(s).toMatch(slug)
        expect((from as (s: string) => string | undefined)(s)).toBe(all[i])
      }
    }
    expect(cityFromSlug('nowhere')).toBeUndefined()
    expect(categoryFromSlug('nothing')).toBeUndefined()
  })

  it('人生階段主題：代號唯一、關鍵字是合法的正規表示式', () => {
    expect(new Set(TOPIC_SLUGS).size).toBe(TOPICS.length)
    for (const t of TOPICS) {
      expect(t.slug).toMatch(slug)
      expect(() => new RegExp(t.pattern)).not.toThrow()
      expect(topicFromSlug(t.slug)).toBe(t)
    }
    expect(new RegExp(topicFromSlug('pregnancy')!.pattern).test('生育津貼')).toBe(true)
    expect(topicFromSlug('nope')).toBeUndefined()
  })
})
