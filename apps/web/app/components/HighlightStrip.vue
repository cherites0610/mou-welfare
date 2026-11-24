<!-- 列表頂端的精選區塊（GET /v1/highlights）：精選的全國性福利、30 天內截止的福利。
     只在沒有任何篩選條件時顯示；伺服器端渲染，搜尋引擎也看得到這些連結。 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { WelfareSummary } from '~/utils/welfare'

const api = useApi()
const { data } = await useAsyncData('highlights', () =>
  api<{ data: { featured: WelfareSummary[]; closingSoon: WelfareSummary[] } }>('/v1/highlights', { credentials: 'omit' }).then(
    (r) => r.data,
  ),
)

/** 剩幾天（截止日當天算 0 天，以臺灣時間的當天結束為準） */
const daysLeft = (deadline: string) => Math.max(0, Math.floor((Date.parse(`${deadline}T23:59:59+08:00`) - Date.now()) / 86_400_000))
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
</script>

<template>
  <div v-if="data && (data.featured.length || data.closingSoon.length)" class="py-3 space-y-4 bg-gray-50/60 border-b border-gray-100">
    <section v-if="data.featured.length">
      <h2 class="px-4 mb-2 font-bold text-gray-800 flex items-center gap-1.5">
        <Icon icon="mingcute:star-fill" class="text-orange-400" />
        精選福利
        <NuxtLink to="/national" class="ml-auto text-xs font-normal text-gray-400 hover:text-mygreen">全國性福利 ›</NuxtLink>
      </h2>
      <ul class="flex gap-3 overflow-x-auto px-4 scroll-px-4 pb-1 snap-x no-scrollbar">
        <li v-for="w in data.featured" :key="w.id" class="snap-start shrink-0 w-64">
          <NuxtLink :to="`/welfares/${w.id}`"
            class="flex flex-col h-full p-4 rounded-2xl bg-white border border-green-100 shadow-sm hover:border-mygreen transition">
            <span class="text-xs text-mygreen font-bold">{{ w.city }}</span>
            <span class="mt-1 font-bold text-gray-800 leading-snug line-clamp-2">{{ w.name }}</span>
            <span v-if="w.deadline" class="mt-auto pt-2 text-xs font-bold text-orange-500">{{ shortDate(w.deadline) }} 截止</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section v-if="data.closingSoon.length">
      <h2 class="px-4 mb-2 font-bold text-gray-800 flex items-center gap-1.5">
        <Icon icon="mingcute:alarm-2-fill" class="text-myred" />
        即將截止
      </h2>
      <ul class="flex gap-3 overflow-x-auto px-4 scroll-px-4 pb-1 snap-x no-scrollbar">
        <li v-for="w in data.closingSoon" :key="w.id" class="snap-start shrink-0 w-56">
          <NuxtLink :to="`/welfares/${w.id}`"
            class="flex flex-col h-full p-3 rounded-2xl bg-white border border-gray-100 hover:border-myred transition">
            <span class="self-start px-2 py-0.5 rounded-full bg-red-50 text-myred text-xs font-bold">
              {{ daysLeft(w.deadline!) === 0 ? '今天截止' : `剩 ${daysLeft(w.deadline!)} 天` }}
            </span>
            <span class="mt-2 text-sm font-bold text-gray-800 leading-snug line-clamp-2">{{ w.name }}</span>
            <span class="mt-auto pt-1 text-xs text-gray-400">{{ w.city }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
