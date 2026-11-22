<!-- 福利列表：沿用 v1 web/src/views/welfare/index.vue（搜尋、篩選列、無限捲動、阿哞按鈕）。
     篩選條件放在網址，返回列表時保留；第一頁在伺服器端渲染（SEO）。
     比對結果（燈號）只在「自動篩選」或「進階篩選」時顯示，與 v1 相同。 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { FilterState } from '~/components/WelfareFilterBar.vue'
import type { WelfareList, WelfareSummary } from '~/utils/welfare'

useHead({ title: '福利搜尋 | 哞福利' })

const route = useRoute()
const router = useRouter()
const api = useApi()
const session = useSession()

const PAGE_SIZE = 10
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const csv = (v: unknown) => (str(v) ? str(v).split(',') : [])

// 網址 → 查詢條件
const filters = computed<FilterState & { q: string }>(() => ({
  q: str(route.query.q),
  cities: csv(route.query.city),
  categories: csv(route.query.category),
  family: str(route.query.family) || null,
  isAuto: route.query.auto === '1',
  identities: csv(route.query.ids),
}))
const queryKey = computed(() => JSON.stringify(filters.value))

/** 用到個人資料（自動篩選、家庭）時才帶登入 cookie；其餘一律匿名查詢，讓排序與伺服器端渲染的第一頁一致 */
async function fetchPage(page: number): Promise<WelfareList> {
  const f = filters.value
  const base = {
    q: f.q || undefined,
    city: f.cities.join(',') || undefined,
    category: f.categories.join(',') || undefined,
    page,
    limit: PAGE_SIZE,
  }
  if (f.identities.length) {
    return api<WelfareList>('/v1/welfare/simulate', {
      method: 'POST',
      body: { ...base, profile: { identities: f.identities } },
      credentials: 'omit',
    })
  }
  const personal = f.isAuto || !!f.family
  const res = await api<WelfareList>('/v1/welfare', {
    query: { ...base, familyId: f.family || undefined },
    credentials: personal ? 'include' : 'omit',
  })
  // 沒開自動篩選時不顯示自己的燈號（與 v1 相同）
  if (!f.isAuto) res.data = res.data.map((x) => ({ ...x, match: null }))
  return res
}

const personalAtStart = filters.value.isAuto || !!filters.value.family
const { data: first, error } = await useAsyncData('welfare-list', () => fetchPage(1), {
  watch: [queryKey],
  // 個人化的查詢要帶 API 網域的 cookie，只能在瀏覽器執行
  server: !personalAtStart,
})

// --- 狀態管理 ---
const search = ref(filters.value.q)
const welfareList = ref<WelfareSummary[]>([]) // 本地列表，用來累加資料
const loading = ref(false)
const noMore = ref(false)
const page = ref(1)

watch(
  [first, error],
  () => {
    welfareList.value = [...(first.value?.data ?? [])]
    page.value = 1
    noMore.value = !!error.value || welfareList.value.length >= (first.value?.meta.total ?? 0)
  },
  { immediate: true },
)

const loadMore = async () => {
  // 防呆：如果正在載入或沒資料了，就停止
  if (loading.value || noMore.value || !first.value) return
  loading.value = true
  try {
    const res = await fetchPage(page.value + 1)
    welfareList.value.push(...res.data)
    page.value++
    if (res.data.length < PAGE_SIZE || welfareList.value.length >= res.meta.total) noMore.value = true
  } catch (err) {
    console.error('載入失敗:', err)
    noMore.value = true // 發生錯誤時停止無限重試
  } finally {
    loading.value = false
  }
}

function updateQuery(f: Partial<FilterState & { q: string }>) {
  const next = { ...filters.value, ...f }
  router.replace({
    query: {
      ...(next.q ? { q: next.q } : {}),
      ...(next.cities.length ? { city: next.cities.join(',') } : {}),
      ...(next.categories.length ? { category: next.categories.join(',') } : {}),
      ...(next.family ? { family: next.family } : {}),
      ...(next.isAuto ? { auto: '1' } : {}),
      ...(next.identities.length ? { ids: next.identities.join(',') } : {}),
    },
  })
}

// --- 搜尋功能 ---
const handleSearch = () => {
  updateQuery({ q: search.value.trim().slice(0, 50) })
}

const handleFilterChange = (f: FilterState) => {
  updateQuery({ ...f, q: search.value.trim().slice(0, 50) })
}

const collect = () => {
  if (!session.value.data) {
    router.push({ path: '/login', query: { redirect: '/favorites' } })
    return
  }
  router.push('/favorites')
}
const question = () => {
  router.push('/question')
}

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
watch(() => !!session.value.data, (v) => v && refreshFavorites(), { immediate: true })

// 阿哞聊天（v1 在列表頁開浮動聊天視窗；v2 的聊天尚未完成，先導向聊天頁）
const isChatOpen = ref(false)
const toggleChat = () => {
  if (!session.value.data) {
    router.push({ path: '/login', query: { redirect: '/chat' } })
    return
  }
  router.push('/chat')
}
</script>

<template>
  <div class="flex flex-col h-screen md:h-[calc(100vh-8rem)] overflow-hidden">
    <div class="flex gap-3 items-center transition-colors duration-300 bg-mygreen md:bg-white p-4 shrink-0">
      <el-input v-model="search" placeholder="Ex.租屋補助" class="w-60" clearable @keyup.enter="handleSearch"
        @clear="handleSearch">
        <template #prefix>
          <div class="flex items-center h-full">
            <Icon icon="mingcute:search-line" class="text-lg text-gray-400" />
          </div>
        </template>
      </el-input>
      <Icon @click="collect" icon="mdi:heart-outline"
        class="text-3xl cursor-pointer transition-all duration-300 hover:text-mygreen-400 hover:scale-110 active:scale-90" />
      <Icon @click="question" icon="mingcute:question-line" class="text-3xl md:hidden" />
    </div>

    <WelfareFilterBar :initial="filters" @change="handleFilterChange" class="shrink-0" />

    <div class="flex-1 overflow-y-auto">
      <ul v-infinite-scroll="loadMore" :infinite-scroll-disabled="loading || noMore" :infinite-scroll-distance="50"
        :infinite-scroll-immediate="false"
        class="mx-auto pb-10">
        <li v-for="item in welfareList" :key="item.id">
          <WelfareCard :favorites-welfare-ids="favoriteIds" :data="item" :family-id="filters.family"
            @update-favorites="refreshFavorites" />
        </li>
      </ul>

      <div class="py-4 text-center text-gray-400 text-sm">
        <p v-if="loading" class="flex items-center justify-center gap-2">
          <Icon icon="line-md:loading-loop" class="text-xl" /> 努力載入中...
        </p>
        <p v-if="noMore && welfareList.length > 0">已經到底囉</p>
        <p v-if="noMore && welfareList.length === 0" class="mt-10">
          <Icon icon="mdi:package-variant-closed" class="text-4xl mx-auto mb-2 text-gray-300" />
          找不到相關福利
        </p>
      </div>
    </div>

    <div class="fixed bottom-8 right-8 z-50 hidden md:flex flex-col items-end gap-2">
      <transition name="fade">
        <div v-if="!isChatOpen"
          class="bg-white px-4 py-2 rounded-xl shadow-lg border border-gray-100 mb-2 relative mr-2">
          <p class="text-sm font-bold text-gray-700">有福利問題？問問阿哞！</p>
          <div
            class="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-b border-r border-gray-100 transform rotate-45">
          </div>
        </div>
      </transition>

     <button
  @click="toggleChat"
  class="w-16 h-16 rounded-full shadow-[0_4px_20px_rgba(132,204,22,0.4)] bg-white hover:bg-[#497606] transition-all duration-300 flex items-center justify-center group active:scale-95"
>
  <transition name="scale" mode="out-in">
    <!-- 聊天室關閉時：顯示彩色的阿哞 -->
    <img
      v-if="!isChatOpen"
      src="/fv.png"
      class="w-10 h-10 object-contain group-hover:scale-110 transition-transform"
    />

    <!-- 聊天室打開時：顯示黑白的阿哞 (替換掉原本隱形的 Icon) -->
    <img
      v-else
      src="/black-fv.png"
      class="w-10 h-10 object-contain group-hover:scale-110 transition-transform"
    />
  </transition>
</button>
    </div>

  </div>
</template>

<style scoped>
/* 隱藏 Chrome/Safari/Edge 的卷軸 (選用，讓畫面更乾淨) */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

@media screen and (max-width: 768px) {
  :deep(.el-input__inner) {
    font-size: 16px !important;
    /* 強制 16px，iOS 就不會縮放了 */
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.scale-enter-active,
.scale-leave-active {
  transition: transform 0.2s ease;
}

.scale-enter-from,
.scale-leave-to {
  transform: scale(0);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
