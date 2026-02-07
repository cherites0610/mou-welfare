<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import { useWelfareStore } from '@/stores/welfare'
import type { WelfareResponse } from '../../api/welfare/model'
import WelfareCard from '../../components/welfareCard.vue' // 引入子組件
import { getFavorites } from '@/api/user'
import WelfareFilterBar, { type FilterState } from '../../components/WelfareFilterBar.vue' // 引入子組件
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
const router = useRouter()
const userStore = useUserStore()
const welfareStore = useWelfareStore()
const favoriteIds = ref<Set<string>>(new Set())

onMounted(async () => {
  console.log(userStore.userInfo)
  welfareStore.updateParams({
    cities: [],
    categories: [],
    identities: [],
    keywords: '',
    userId: undefined,
    familyId: undefined,
    page: 1,
    limit: 10,
  })

  loadMore()
  await refreshFavorites() 
})
// --- 狀態管理 ---
const search = ref('')
const welfareList = ref<WelfareResponse[]>([]) // 本地列表，用來累加資料
const loading = ref(false)
const noMore = ref(false)

// 分頁參數
const pagination = reactive({
  page: 1,
  limit: 10,
})

const loadMore = async () => {
  // 防呆：如果正在載入或沒資料了，就停止
  if (loading.value || noMore.value) return
  loading.value = true
  try {
    welfareStore.updateParams({
      page: pagination.page,
      limit: pagination.limit
    })
    // 2. 執行搜尋
    await welfareStore.executeSearch()
    // 3. 處理回傳資料
    const newItems = welfareStore.welfares || []
    if (newItems.length === 0) {
      noMore.value = true
    } else {
      welfareList.value.push(...newItems)
      pagination.page++
      if (newItems.length < pagination.limit) {
        noMore.value = true
      }
    }
  } catch (error) {
    console.error('載入失敗:', error)
    noMore.value = true // 發生錯誤時停止無限重試
  } finally {
    loading.value = false
  }
}

// --- 搜尋功能 ---
const handleSearch = () => {
  // 重置列表狀態
  welfareList.value = []
  pagination.page = 1
  noMore.value = false
  welfareStore.updateParams({
    keywords: search.value,
    page: 1,
    limit: 10
  })

  loadMore()
}

const handleFilterChange = (filters: FilterState) => {
  // 1. 重置本地列表與狀態
  welfareList.value = []
  pagination.page = 1
  noMore.value = false

  // 更新 Store 的篩選條件
  welfareStore.updateParams({
    keywords: search.value,
    cities: filters.cities,
    categories: filters.categories,
    identities: filters.identities,
    userId: filters.userId || undefined,
    familyId: filters.family || undefined,
    page: 1,
    limit: 10
  })

  // 3. 觸發載入
  loadMore()
}

const collect = () => console.log('收藏')
const question = () => {
  router.push('/question')
}

const refreshFavorites = async () => {
  try {
    const favorites = await getFavorites()
    if (Array.isArray(favorites)) {
      favoriteIds.value = new Set(favorites.map((w) => w.id))
    }
  } catch (error) {
    console.error('載入收藏失敗:', error)
  }
}
</script>

<template>
  <div class="flex flex-col h-screen">
    <div class="flex gap-3 items-center transition-colors duration-300 bg-mygreen md:bg-white p-4">
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
    <WelfareFilterBar @change="handleFilterChange" />
    <div class="flex-1 overflow-y-auto">
      <ul v-infinite-scroll="loadMore" :infinite-scroll-disabled="loading || noMore" :infinite-scroll-distance="50"
        class="mx-auto pb-10">
        <li v-for="item in welfareList" :key="item.id">
          <WelfareCard :favorites-welfare-ids="favoriteIds" :data="item" @update-favorites="refreshFavorites"/>
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
    font-size: 16px !important; /* 強制 16px，iOS 就不會縮放了 */
  }
}
</style>
