<!-- 依主題找福利：人生階段主題與縣市的入口頁（也讓搜尋引擎找得到所有主題頁） -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { CATEGORIES } from '@mou-welfare/shared'

const { public: cfg } = useRuntimeConfig()
const DESC = '依人生階段（懷孕生產、育兒、就學、租屋、長照、喪葬…）或縣市，查詢全台各縣市政府的社會福利與補助。'
useHead({
  title: '依主題找福利 | 哞福利',
  link: [{ rel: 'canonical', href: `${cfg.siteUrl}/topics` }],
  meta: [
    { name: 'description', content: DESC },
    { property: 'og:title', content: '依主題找福利 | 哞福利' },
    { property: 'og:description', content: DESC },
    { property: 'og:url', content: `${cfg.siteUrl}/topics` },
  ],
})

const counts = await useTopicCounts()
</script>

<template>
  <div class="bg-white md:rounded-2xl min-h-full px-4 py-5 space-y-8">
    <header>
      <h1 class="text-2xl font-bold text-gray-800">依主題找福利</h1>
      <p class="mt-2 text-gray-600">不知道從哪裡找起？從你現在遇到的情況，或你住的縣市開始看。</p>
    </header>

    <section>
      <h2 class="font-bold text-gray-800 mb-3">人生階段</h2>
      <ul class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <li v-for="t in counts.topics.filter((t) => t.total)" :key="t.slug">
          <NuxtLink :to="topicPath(t.slug)"
            class="block h-full p-4 rounded-xl border border-gray-100 hover:border-mygreen hover:shadow-sm transition">
            <span class="font-bold text-gray-800">{{ t.name }}</span>
            <span class="block text-xs text-gray-400 mt-1">{{ t.total }} 筆</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="font-bold text-gray-800 mb-3">依縣市</h2>
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <li v-for="c in counts.cities" :key="c.city" class="p-4 rounded-xl border border-gray-100">
          <NuxtLink :to="cityPath(c.city)" class="font-bold text-gray-800 hover:text-mygreen inline-flex items-center gap-1">
            {{ c.city }} <span class="text-xs text-gray-400 font-normal">{{ c.total }} 筆</span>
            <Icon icon="mingcute:right-line" class="text-gray-400" />
          </NuxtLink>
          <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <li v-for="cat in CATEGORIES.filter((x) => counts.pairTotal(c.city, x))" :key="cat">
              <NuxtLink :to="cityCategoryPath(c.city, cat)" class="text-gray-500 hover:text-mygreen">{{ cat }}</NuxtLink>
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
</template>
