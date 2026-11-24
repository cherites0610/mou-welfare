<!-- 縣市 × 類別頁（例如 /cities/taipei/elderly） -->
<script setup lang="ts">
import { CATEGORIES, categoryFromSlug, cityFromSlug } from '@mou-welfare/shared'

const route = useRoute()
const city = cityFromSlug(String(route.params.city))
const category = categoryFromSlug(String(route.params.category))
if (!city || !category) throw createError({ statusCode: 404, statusMessage: '找不到這個分類', fatal: true })

const counts = await useTopicCounts()
const related = computed(() => [
  {
    title: `${city}其他福利`,
    links: CATEGORIES.filter((c) => c !== category && counts.value.pairTotal(city, c)).map((c) => ({
      label: `${city}${c}`,
      to: cityCategoryPath(city, c),
      total: counts.value.pairTotal(city, c),
    })),
  },
  {
    title: `其他縣市的${category}`,
    links: counts.value.cities
      .filter((c) => c.city !== city && counts.value.pairTotal(c.city, category))
      .map((c) => ({ label: c.city, to: cityCategoryPath(c.city, category), total: counts.value.pairTotal(c.city, category) })),
  },
])
</script>

<template>
  <TopicListing :key="`${city}-${category}`" :path="cityCategoryPath(city!, category!)" :heading="`${city}${category}補助`"
    :intro="`${city}政府的${category}，包含申請資格、補助內容與申辦方式。`"
    :crumbs="[{ label: '首頁', to: '/welfares' }, { label: city!, to: cityPath(city!) }]"
    :query="{ city: city!, category: category! }" :related="related" />
</template>
