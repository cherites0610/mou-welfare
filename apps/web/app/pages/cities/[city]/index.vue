<!-- 縣市頁（例如 /cities/taipei）：該縣市所有上架中的福利 -->
<script setup lang="ts">
import { CATEGORIES, cityFromSlug } from '@mou-welfare/shared'

const route = useRoute()
const city = cityFromSlug(String(route.params.city))
if (!city) throw createError({ statusCode: 404, statusMessage: '找不到這個縣市', fatal: true })

const counts = await useTopicCounts()
const related = computed(() => [
  {
    title: `${city}各類福利`,
    links: CATEGORIES.filter((c) => counts.value.pairTotal(city, c)).map((c) => ({
      label: `${city}${c}`,
      to: cityCategoryPath(city, c),
      total: counts.value.pairTotal(city, c),
    })),
  },
  {
    title: '其他縣市',
    links: counts.value.cities.filter((c) => c.city !== city).map((c) => ({ label: c.city, to: cityPath(c.city), total: c.total })),
  },
])
</script>

<template>
  <TopicListing :key="city!" :path="cityPath(city!)" :heading="`${city}社會福利與補助`"
    :intro="`${city}政府提供的社會福利與補助，包含老人、身心障礙、兒少、婦幼與社會救助等。`"
    :crumbs="[{ label: '首頁', to: '/welfares' }, { label: '依主題找福利', to: '/topics' }]" :query="{ city: city! }"
    :related="related" />
</template>
