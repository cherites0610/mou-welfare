<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import { useWelfareStore } from '@/stores/welfare'
import type { WelfareResponse } from '../../api/welfare/model'
import WelfareCard from '../../components/welfareCard.vue' // 引入子組件
import { addFavorite, getFavorites } from '@/api/user'

const welfareStore = useWelfareStore()
const favoriteIds = ref<Set<string>>(new Set())
  
onMounted(async () => {
  loadMore() 
  try {
    const favorites = await getFavorites() 
    if (Array.isArray(favorites)) {
      favoriteIds.value = new Set(favorites.map((w) => w.id))
    }
  } catch (error) {
    console.error('載入收藏失敗:', error)
  }
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

// --- 核心：載入更多資料 (無限滾動觸發) ---
const loadMore = async () => {
  // 防呆：如果正在載入或沒資料了，就停止
  if (loading.value || noMore.value) return

  loading.value = true

  try {
    // 1. 設定參數 (初始篩選：什麼都不篩)
    welfareStore.updateParams({
      cities: [], // 📍 空陣列：不限縣市
      categories: [], // 📍 空陣列：不限類別
      keywords: search.value,
      userId: '738f60f7-aa96-470c-adc1-83717b84ade7', // 固定 User ID
      familyId: undefined, // 📍 undefined：不限特定家人
      page: pagination.page,
      limit: pagination.limit,
    })

    // 2. 呼叫 API
    await welfareStore.executeSearch()

    // 3. 取得新資料 (假設 Store 執行後會更新 welfares 或回傳資料)
    // 這裡假設 welfareStore.welfares 是當次請求回來的資料
    const newItems = welfareStore.welfares || []

    // 4. 判斷是否還有資料
    if (newItems.length === 0) {
      noMore.value = true
    } else {
      // 5. 將新資料「追加」到本地列表
      welfareList.value.push(...newItems)

      // 6. 頁碼 +1
      pagination.page++

      // 如果回傳數量少於 limit，表示是最後一頁了
      if (newItems.length < pagination.limit) {
        noMore.value = true
      }
    }
  } catch (error) {
    console.error('載入失敗:', error)
    noMore.value = true // 避免錯誤後無限重試
  } finally {
    loading.value = false
  }
}

// --- 搜尋功能 ---
const handleSearch = () => {
  // 重置所有狀態
  welfareList.value = []
  pagination.page = 1
  noMore.value = false
  // 重新觸發載入 (因為列表清空，infinite-scroll 會自動檢測並觸發 loadMore)
  loadMore()
}

// Header 按鈕事件
const collect = () => console.log('收藏')
const question = () => console.log('常見問題')
</script>

<template>
  <div class="flex flex-col h-screen">
    <!--搜索框-->
    <div class="flex gap-3 items-center transition-colors duration-300 bg-mygreen md:bg-white p-4">
      <el-input v-model="search" placeholder="Ex.租屋補助" class="w-60">
        <template #prefix>
          <div class="flex items-center h-full">
            <Icon icon="mingcute:search-line" class="text-lg text-gray-400" />
          </div>
        </template>
      </el-input>
      <Icon
        @click="collect"
        icon="mdi:heart-outline"
        class="text-3xl cursor-pointer transition-all duration-300 hover:text-mygreen-400 hover:scale-110 active:scale-90"
      />
      <Icon @click="question" icon="mingcute:question-line" class="text-3xl md:hidden" />
    </div>
    <div class="flex-1 overflow-y-auto p-4">
      <ul
        v-infinite-scroll="loadMore"
        :infinite-scroll-disabled="loading || noMore"
        :infinite-scroll-distance="50"
        class="space-y-4 mx-auto pb-10"
      >
        <li v-for="item in welfareList" :key="item.id">
          <WelfareCard :favorites-welfare-ids="favoriteIds" :data="item" />
        </li>
      </ul>

      <div class="py-4 text-center text-gray-400 text-sm">
        <p v-if="loading" class="flex items-center justify-center gap-2">
          <Icon icon="line-md:loading-loop" class="text-xl" /> 努力載入中...
        </p>
        <p v-if="noMore && welfareList.length > 0">已經到底囉 🎉</p>
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
</style>
