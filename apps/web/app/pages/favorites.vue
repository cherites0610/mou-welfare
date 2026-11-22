<!-- 收藏福利：沿用 v1 web/src/views/favorites/index.vue（GET /v1/me/favorites 一次回傳全部，不分頁） -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { WelfareSummary } from '~/utils/welfare'

definePageMeta({ layout: false, middleware: 'auth' })
useHead({ title: '收藏福利 | 哞福利', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const router = useRouter()
const api = useApi()

const welfareList = ref<WelfareSummary[]>([]) // 存放福利列表
const favoriteIds = ref<Set<string>>(new Set()) // 存放收藏 ID (讓卡片顯示紅心)
const loading = ref(false)
const noMore = ref(false)

const goBack = () => {
  router.back()
}

onMounted(async () => {
  await refreshFavorites()
})

const refreshFavorites = async () => {
  loading.value = true
  try {
    const favorites = (await api<{ data: WelfareSummary[] }>('/v1/me/favorites')).data
    welfareList.value = favorites
    favoriteIds.value = new Set(favorites.map((item) => item.id))
  } catch (error) {
    console.error('載入收藏失敗:', error)
  } finally {
    noMore.value = true
    loading.value = false
  }
}
const loadMore = () => {
  if (loading.value || noMore.value) return
}
</script>

<template>
  <div class="min-h-screen w-full flex flex-col">
    <AppHeader class="hidden md:block" />

    <div
      class="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden shadow-sm shrink-0"
    >
      <button
        @click="goBack"
        class="p-1 -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Icon icon="mingcute:left-line" class="text-2xl" />
      </button>
      <span class="font-bold text-lg text-gray-800">收藏福利</span>
      <div class="w-8"></div>
    </div>

    <div class="w-full max-w-7xl mx-auto flex-1 md:p-6 p-1">
      
      <div> 
        <ul
          v-infinite-scroll="loadMore"
          :infinite-scroll-disabled="loading || noMore"
          :infinite-scroll-distance="50"
          class="mx-auto pb-10"
        >
          <li v-for="item in welfareList" :key="item.id">
            <WelfareCard
              :favorites-welfare-ids="favoriteIds"
              :data="item"
              @update-favorites="refreshFavorites"
            />
          </li>
        </ul>

        <div class="py-4 text-center text-gray-400 text-sm">
          <p v-if="loading" class="flex items-center justify-center gap-2">
            <Icon icon="line-md:loading-loop" class="text-xl" /> 努力載入中...
          </p>
          <p v-if="noMore && welfareList.length > 0">已經到底囉</p>
          <p v-if="!loading && welfareList.length === 0" class="mt-10">
            <Icon icon="mdi:heart-broken" class="text-4xl mx-auto mb-2 text-gray-300" />
            還沒有收藏任何福利喔
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隱藏卷軸 */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
