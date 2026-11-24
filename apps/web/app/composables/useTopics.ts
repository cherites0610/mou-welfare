// 主題頁共用：各主題的福利筆數（GET /v1/topics，伺服器端取一次、各頁共用）與網址。
import { CATEGORY_SLUGS, CITIES, CITY_SLUGS, type Category, type City, TOPICS } from '@mou-welfare/shared'

export type TopicCounts = {
  cities: { city: string; total: number; categories: Record<string, number> }[]
  /** 全國性福利（中央）：依縣市篩選時也會列出，所以縣市頁的筆數要加上 */
  national: { total: number; categories: Record<string, number> }
  topics: { slug: string; total: number }[]
}

export const cityPath = (city: City) => `/cities/${CITY_SLUGS[city]}`
export const cityCategoryPath = (city: City, category: Category) => `${cityPath(city)}/${CATEGORY_SLUGS[category]}`
export const topicPath = (slug: string) => `/topics/${slug}`

export async function useTopicCounts() {
  const api = useApi()
  const { data } = await useAsyncData('topic-counts', () =>
    api<{ data: TopicCounts }>('/v1/topics', { credentials: 'omit' }).then((r) => r.data),
  )
  return computed(() => {
    const counts = data.value
    const byCity = new Map(counts?.cities.map((c) => [c.city, c]))
    const national = counts?.national ?? { total: 0, categories: {} }
    const pairTotal = (c: City, cat: Category) => (byCity.get(c)?.categories[cat] ?? 0) + (national.categories[cat] ?? 0)
    return {
      loaded: !!counts,
      national,
      /** 有自己資料的縣市（依 CITIES 的順序）；筆數含全國性福利 */
      cities: CITIES.filter((c) => byCity.get(c)?.total).map((c) => ({ city: c, total: byCity.get(c)!.total + national.total })),
      /** 縣市 × 類別的筆數（含全國性福利）；縣市自己沒有這個類別時為 0（不列連結） */
      pairTotal: (c: City, cat: Category) => (byCity.get(c)?.categories[cat] ? pairTotal(c, cat) : 0),
      topics: TOPICS.map((t) => ({ ...t, total: counts?.topics.find((x) => x.slug === t.slug)?.total ?? 0 })),
    }
  })
}
