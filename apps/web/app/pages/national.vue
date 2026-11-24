<!-- 全國性福利（中央政府）：住在哪個縣市都能申請，例如租金補貼、中央社宅、國民年金、老農津貼 -->
<script setup lang="ts">
import { NATIONAL } from '@mou-welfare/shared'

const counts = await useTopicCounts()
const related = computed(() => [
  {
    title: '依主題查詢',
    links: counts.value.topics.filter((t) => t.total).map((t) => ({ label: t.name, to: topicPath(t.slug), total: t.total })),
  },
  {
    title: '依縣市查詢',
    links: counts.value.cities.map((c) => ({ label: c.city, to: cityPath(c.city), total: c.total })),
  },
])
</script>

<template>
  <TopicListing path="/national" heading="全國性福利與補助"
    intro="中央政府的福利與補助，不論住在哪個縣市都可以申請，例如租金補貼、中央社會住宅、國民年金與老農津貼。"
    :crumbs="[{ label: '首頁', to: '/welfares' }, { label: '依主題找福利', to: '/topics' }]" :query="{ city: NATIONAL }"
    :related="related" />
</template>
