<!-- 人生階段主題頁（例如 /topics/pregnancy）：全台各縣市的相關福利 -->
<script setup lang="ts">
import { topicFromSlug } from '@mou-welfare/shared'

const route = useRoute()
const topic = topicFromSlug(String(route.params.slug))
if (!topic) throw createError({ statusCode: 404, statusMessage: '找不到這個主題', fatal: true })

const counts = await useTopicCounts()
const related = computed(() => [
  {
    title: '其他主題',
    links: counts.value.topics
      .filter((t) => t.slug !== topic.slug && t.total)
      .map((t) => ({ label: t.name, to: topicPath(t.slug), total: t.total })),
  },
  {
    title: '依縣市查詢',
    links: counts.value.cities.map((c) => ({ label: c.city, to: cityPath(c.city), total: c.total })),
  },
])
</script>

<template>
  <TopicListing :key="topic!.slug" :path="topicPath(topic!.slug)" :heading="`${topic!.name}補助`" :intro="topic!.intro"
    :crumbs="[{ label: '首頁', to: '/welfares' }, { label: '依主題找福利', to: '/topics' }]" :query="{ topic: topic!.slug }"
    :related="related" />
</template>
