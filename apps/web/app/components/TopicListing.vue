<!-- 主題頁（縣市、縣市 × 類別、人生階段）的共用版面：麵包屑、標題與說明、福利列表（伺服器端渲染、分頁）、相關主題連結。
     每一頁的 title、canonical 與 description 在這裡統一設定；沒有資料或超出頁數時回 404。 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { WelfareList } from '~/utils/welfare'

export type TopicLink = { label: string; to: string; total: number }

const props = defineProps<{
  /** 這一頁的網址（不含 ?page） */
  path: string
  heading: string
  intro: string
  crumbs: { label: string; to?: string }[]
  query: { city?: string; category?: string; topic?: string }
  related: { title: string; links: TopicLink[] }[]
}>()

const PAGE_SIZE = 30
const route = useRoute()
const api = useApi()
const session = useSession()
const { public: cfg } = useRuntimeConfig()

const page = computed(() => {
  const n = Number(route.query.page ?? 1)
  return Number.isInteger(n) && n >= 1 ? n : NaN
})
if (Number.isNaN(page.value)) throw createError({ statusCode: 404, statusMessage: '找不到這一頁', fatal: true })

const { data: list } = await useAsyncData(
  () => `topic-${props.path}-${page.value}`,
  () =>
    api<WelfareList>('/v1/welfare', {
      query: { ...props.query, page: page.value, limit: PAGE_SIZE },
      credentials: 'omit',
    }),
  { watch: [page] },
)
const total = computed(() => list.value?.meta.total ?? 0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
if (!list.value?.data.length) throw createError({ statusCode: 404, statusMessage: '這個主題目前沒有福利', fatal: true })

const pageUrl = (n: number) => (n === 1 ? props.path : `${props.path}?page=${n}`)

useHead(() => {
  const suffix = page.value > 1 ? `（第 ${page.value} 頁）` : ''
  const title = `${props.heading}${suffix} | 哞福利`
  const desc = `${props.intro}共 ${total.value} 筆，整理自各縣市政府公告。`
  const url = cfg.siteUrl + pageUrl(page.value)
  return {
    title,
    link: [{ rel: 'canonical', href: url }],
    meta: [
      { name: 'description', content: desc },
      { property: 'og:title', content: title },
      { property: 'og:description', content: desc },
      { property: 'og:url', content: url },
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [...props.crumbs.filter((c) => c.to), { label: props.heading, to: props.path }].map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            item: cfg.siteUrl + c.to,
          })),
        }),
      },
    ],
  }
})

const favoriteIds = ref<Set<string>>(new Set())
const refreshFavorites = async () => {
  if (!session.value.data) return
  try {
    const favorites = await api<{ data: { id: string }[] }>('/v1/me/favorites')
    favoriteIds.value = new Set(favorites.data.map((w) => w.id))
  } catch (err) {
    console.error('載入收藏失敗:', err)
  }
}
onMounted(() => watch(() => !!session.value.data, (v) => v && refreshFavorites(), { immediate: true }))
</script>

<template>
  <div class="bg-white md:rounded-2xl min-h-full">
    <nav aria-label="麵包屑" class="px-4 pt-4 text-sm text-gray-400 flex flex-wrap items-center gap-1">
      <template v-for="c in crumbs" :key="c.label">
        <NuxtLink v-if="c.to" :to="c.to" class="hover:text-mygreen">{{ c.label }}</NuxtLink>
        <span v-else>{{ c.label }}</span>
        <Icon icon="mingcute:right-line" class="text-xs" />
      </template>
      <span class="text-gray-700">{{ heading }}</span>
    </nav>

    <header class="px-4 pt-3 pb-4 border-b border-gray-100">
      <h1 class="text-2xl font-bold text-gray-800">{{ heading }}</h1>
      <p class="mt-2 text-gray-600 leading-relaxed">
        {{ intro }}目前整理了 <strong class="text-mygreen">{{ total }}</strong> 筆，資料來自各縣市政府公告，申請前請以原始公告為準。
      </p>
      <NuxtLink :to="{ path: '/welfares', query: query.topic ? {} : { city: query.city, category: query.category } }"
        class="mt-3 inline-flex items-center gap-1 text-sm font-bold text-mygreen hover:underline">
        登入後自動比對你符不符合資格
        <Icon icon="mingcute:right-line" />
      </NuxtLink>
    </header>

    <ul>
      <li v-for="item in list?.data" :key="item.id" class="border-b border-gray-50">
        <WelfareCard :favorites-welfare-ids="favoriteIds" :data="item" @update-favorites="refreshFavorites" />
      </li>
    </ul>

    <nav v-if="pages > 1" aria-label="分頁" class="flex justify-center items-center gap-2 py-6 text-sm">
      <NuxtLink v-if="page > 1" :to="pageUrl(page - 1)" class="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-mygreen">上一頁</NuxtLink>
      <NuxtLink v-for="n in pages" :key="n" :to="pageUrl(n)" class="px-3 py-1.5 rounded-lg border"
        :class="n === page ? 'bg-mygreen text-white border-mygreen' : 'border-gray-200 hover:border-mygreen'">{{ n }}</NuxtLink>
      <NuxtLink v-if="page < pages" :to="pageUrl(page + 1)" class="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-mygreen">下一頁</NuxtLink>
    </nav>

    <section v-for="r in related.filter((r) => r.links.length)" :key="r.title" class="px-4 py-5 border-t border-gray-100">
      <h2 class="font-bold text-gray-800 mb-3">{{ r.title }}</h2>
      <ul class="flex flex-wrap gap-2">
        <li v-for="l in r.links" :key="l.to">
          <NuxtLink :to="l.to"
            class="inline-block px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-mygreen hover:text-mygreen">
            {{ l.label }} <span class="text-gray-400">{{ l.total }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
