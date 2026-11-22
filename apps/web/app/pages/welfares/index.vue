<!-- 福利搜尋（粗糙版：先用來檢核爬蟲資料，介面之後再依 v1 調整）。篩選條件放在網址，方便分享與返回。 -->
<script setup lang="ts">
import { CATEGORIES, CITIES } from '@mou-welfare/shared'

useHead({ title: '福利搜尋 | 哞福利' })

const route = useRoute()
const router = useRouter()
const api = useApi()

const PAGE_SIZE = 20
const str = (v: unknown) => (typeof v === 'string' ? v : '')

// 網址 → 查詢條件
const query = computed(() => ({
  q: str(route.query.q),
  city: str(route.query.city),
  category: str(route.query.category),
  page: Math.max(1, Number(route.query.page) || 1),
}))

const { data, status, error } = await useAsyncData(
  'welfare-list',
  () =>
    api<WelfareList>('/v1/welfare', {
      query: {
        q: query.value.q || undefined,
        city: query.value.city || undefined,
        category: query.value.category || undefined,
        page: query.value.page,
        limit: PAGE_SIZE,
      },
    }),
  { watch: [query] },
)

// 表單（按搜尋或切換篩選時寫回網址）
const keyword = ref(query.value.q)
watch(
  () => query.value.q,
  (v) => (keyword.value = v),
)

function update(patch: Partial<{ q: string; city: string; category: string; page: number }>) {
  const next = { ...query.value, page: 1, ...patch }
  router.push({
    query: {
      ...(next.q ? { q: next.q } : {}),
      ...(next.city ? { city: next.city } : {}),
      ...(next.category ? { category: next.category } : {}),
      ...(next.page > 1 ? { page: String(next.page) } : {}),
    },
  })
}

function reset() {
  keyword.value = ''
  router.push({ query: {} })
}

const total = computed(() => data.value?.meta.total ?? 0)
</script>

<template>
  <div class="px-4 py-4 md:px-0 md:py-0 flex flex-col gap-4">
    <!-- 篩選列 -->
    <form class="flex flex-col md:flex-row gap-2" @submit.prevent="update({ q: keyword.trim() })">
      <el-input v-model="keyword" placeholder="搜尋福利名稱或摘要" clearable size="large" class="md:flex-1"
        @clear="update({ q: '' })" />
      <div class="flex gap-2">
        <el-select :model-value="query.city" placeholder="縣市" clearable size="large" class="!w-32"
          @update:model-value="(v: string) => update({ city: v ?? '' })">
          <el-option v-for="c in CITIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select :model-value="query.category" placeholder="類別" clearable size="large" class="!w-40"
          @update:model-value="(v: string) => update({ category: v ?? '' })">
          <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-button type="primary" size="large" native-type="submit">搜尋</el-button>
      </div>
    </form>

    <div class="flex items-center justify-between text-sm text-mygray-300">
      <span v-if="status !== 'pending'">共 {{ total }} 筆</span>
      <span v-else>載入中…</span>
      <button v-if="query.q || query.city || query.category" class="hover:text-mygreen-300" @click="reset">
        清除條件
      </button>
    </div>

    <p v-if="error" class="text-myred text-sm">{{ error.message }}</p>

    <!-- 列表 -->
    <div v-if="data?.data.length" class="grid gap-3 md:grid-cols-2">
      <NuxtLink v-for="w in data.data" :key="w.id" :to="`/welfares/${w.id}`"
        class="block bg-white rounded-xl border border-mygray-100 p-4 hover:border-mygreen hover:shadow-sm transition">
        <div class="flex items-start justify-between gap-2 mb-2">
          <h2 class="font-bold text-gray-800 leading-snug">{{ w.name }}</h2>
          <span class="shrink-0 text-xs text-mygray-300 mt-0.5">{{ w.city }}</span>
        </div>
        <p class="text-sm text-gray-600 line-clamp-3 mb-3">{{ w.summary }}</p>
        <div class="flex flex-wrap gap-1.5 text-xs">
          <span v-for="c in w.categories" :key="c" class="px-2 py-0.5 rounded-full"
            :class="CATEGORY_COLOR[c] ?? 'bg-mygray-100 text-mygray-300'">{{ c }}</span>
          <span v-for="i in w.identities" :key="i" class="px-2 py-0.5 rounded-full border border-mygray-200 text-gray-500">
            {{ i }}
          </span>
        </div>
        <div v-if="w.publishedAt || w.deadline" class="mt-2 text-xs text-mygray-300 flex gap-3">
          <span v-if="w.publishedAt">發布 {{ w.publishedAt }}</span>
          <span v-if="w.deadline">截止 {{ w.deadline }}</span>
        </div>
      </NuxtLink>
    </div>
    <p v-else-if="status === 'success'" class="py-12 text-center text-mygray-300">找不到符合條件的福利</p>

    <el-pagination v-if="total > PAGE_SIZE" class="justify-center" background layout="prev, pager, next"
      :total="total" :page-size="PAGE_SIZE" :current-page="query.page" :pager-count="5"
      @current-change="(p: number) => update({ ...query, page: p })" />
  </div>
</template>
