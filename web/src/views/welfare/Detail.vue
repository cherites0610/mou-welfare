<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWelfareStore } from '@/stores/welfare' // 請確認路徑
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { addFavorite, removeFavorite, getFavorites } from '@/api/user' // 請確認路徑
import { ElMessage } from 'element-plus'

const router = useRouter()
const welfareStore = useWelfareStore()

// 從 Store 取得當前選中的福利資料
// (路由守衛已確保進入此頁時必定有資料)
const { currentWelfare: data } = storeToRefs(welfareStore)

// --- 狀態管理 ---
const isFavorite = ref(false)
const loadingFavorite = ref(false)

// --- 初始化檢查收藏狀態 ---
onMounted(async () => {
  if (!data.value) return
  try {
    const favorites = await getFavorites()
    if (Array.isArray(favorites)) {
      isFavorite.value = favorites.some((f: any) => f.id === data.value?.id)
    }
  } catch (error) {
    console.error('檢查收藏失敗', error)
  }
})

// --- 互動邏輯 ---
const goBack = () => {
  router.back()
}

const goToSource = () => {
  if (data.value?.sourceUrl) {
    window.open(data.value.sourceUrl, '_blank')
  }
}

const toggleFavorite = async () => {
  if (!data.value || loadingFavorite.value) return
  loadingFavorite.value = true
  try {
    if (isFavorite.value) {
      await removeFavorite(data.value.id)
      isFavorite.value = false
      ElMessage.success('已取消收藏')
    } else {
      await addFavorite(data.value.id)
      isFavorite.value = true
      ElMessage.success('已加入收藏')
    }
  } catch (error) {
    ElMessage.error('操作失敗')
    console.error(error)
  } finally {
    loadingFavorite.value = false
  }
}

// --- 資料處理 Helpers ---

// 1. 日期格式化
const formattedDate = computed(() => {
  if (!data.value?.publishDate) return '未知日期'
  return new Date(data.value.publishDate).toLocaleDateString('zh-TW')
})

// 2. 標籤顏色
const getTagColor = (tagName: string) => {
  const map: Record<string, string> = {
    '20歲以下': 'bg-myorange',
    '20歲-65歲': 'bg-myorange',
    '65歲以上': 'bg-myorange',
    '男性': 'bg-myblue',
    '女性': 'bg-myblue',
    '中低收入戶': 'bg-mypurple',
    '低收入戶': 'bg-mypurple',
    '榮民': 'bg-myblue-green',
    '身心障礙者': 'bg-myblue-green',
    '原住民': 'bg-myblue-green',
    '外籍配偶家庭': 'bg-myblue-green',
  }
  return map[tagName] || 'bg-gray-400'
}

// 3. 燈號顏色與文字
const getLightInfo = (light: string) => {
  switch (light) {
    case 'GREEN': return { color: 'text-green-500', bg: 'bg-green-100', text: '符合資格', border: 'border-green-500' }
    case 'YELLOW': return { color: 'text-yellow-500', bg: 'bg-yellow-100', text: '部分符合', border: 'border-yellow-500' }
    case 'RED': return { color: 'text-red-500', bg: 'bg-red-100', text: '資格不符', border: 'border-red-500' }
    default: return { color: 'text-gray-400', bg: 'bg-gray-100', text: '未分析', border: 'border-gray-300' }
  }
}

// 4. 家庭成員列表 (過濾掉沒有 userId 的無效資料)
const validFamilyMatches = computed(() => {
  return data.value?.familyMatches?.filter((m: any) => m.userId) || []
})
const showOriginalContent = ref(false)
</script>

<template>
  <div v-if="data" class="min-h-screen bg-[#F8FAFC] pb-24 md:pb-10 font-sans">
    
    <div class="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden shadow-sm">
      <button @click="goBack" class="w-8 h-8 flex items-center justify-center -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
        <Icon icon="mingcute:left-line" class="text-2xl" />
      </button>
      <span class="font-bold text-lg text-gray-800 truncate max-w-[200px]">福利詳情</span>
      <button @click="toggleFavorite" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
        <Icon :icon="isFavorite ? 'mingcute:heart-fill' : 'mingcute:heart-line'" class="text-2xl transition-transform active:scale-75 duration-200" :class="{ 'text-red-500': isFavorite }" />
      </button>
    </div>

    <div class="hidden md:flex max-w-4xl mx-auto pt-8 px-6 items-center gap-2 text-gray-400 text-sm font-medium">
      <span class="cursor-pointer hover:text-mygreen transition-colors" @click="router.push('/welfares')">首頁</span>
      <Icon icon="mingcute:right-line" class="text-xs" />
      <span class="text-gray-800">福利詳情</span>
    </div>

    <div class="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

      <div class="bg-white rounded-3xl p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-50 relative overflow-hidden">
        
        <div class="absolute top-0 right-0 w-64 h-64 bg-green-50 rounded-full -mr-20 -mt-20 blur-3xl opacity-50 pointer-events-none"></div>

        <div class="relative z-10">
          
          <div class="flex items-center gap-3 mb-5">
            <span class="bg-green-50 text-mygreen px-3 py-1 rounded-full text-xs font-bold border border-green-100 flex items-center gap-1">
              <Icon icon="mingcute:location-line" />
              {{ data.sourceCity }}
            </span>
            <span class="text-gray-400 text-xs flex items-center gap-1 font-medium">
              <Icon icon="mingcute:time-line" />
              {{ formattedDate }} 發布
            </span>
          </div>
          
          <h1 class="text-2xl md:text-4xl font-extrabold text-gray-800 leading-tight mb-6">
            {{ data.name }}
          </h1>

          <div class="flex flex-wrap gap-2 mb-8">
            <span v-for="cat in data.categories" :key="cat" class="text-gray-500 border border-gray-200 bg-white px-3 py-1.5 rounded-lg text-sm font-medium">
              # {{ cat }}
            </span>
            <span v-for="tag in data.identity" :key="tag" class="px-3 py-1.5 rounded-lg text-white text-sm font-bold shadow-sm flex items-center gap-1" :class="getTagColor(tag)">
              {{ tag }}
            </span>
          </div>

          <div class="h-px bg-gray-100 w-full mb-6"></div>

          <div class="flex flex-col sm:flex-row gap-4 justify-between items-center">
             
             <div class="w-full sm:w-auto flex flex-col gap-1">
                <a :href="data.sourceUrl" target="_blank" class="text-sm font-bold text-mygreen hover:underline flex items-center gap-1 w-fit">
                   開啟原始公告
                   <Icon icon="mingcute:external-link-line" />
                </a>
             </div>

             <div class="hidden md:flex items-center gap-3">
                <button @click="toggleFavorite" 
                   class="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-2 active:scale-95 group">
                   <Icon :icon="isFavorite ? 'mingcute:heart-fill' : 'mingcute:heart-line'" class="text-xl transition-colors group-hover:scale-110" :class="{ 'text-red-500': isFavorite }" />
                   {{ isFavorite ? '已收藏' : '收藏' }}
                </button>
             </div>
          </div>

        </div>
      </div>

      <div v-if="validFamilyMatches.length > 0" class="space-y-4">
          <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2 px-1">
             <div class="w-8 h-8 rounded-full  text-blue-500 flex items-center justify-center">
                <Icon icon="mingcute:group-fill" class="text-lg" />
             </div>
             家庭成員資格分析
          </h2>
          
          <div class="grid gap-4 sm:grid-cols-2">
            <div v-for="member in validFamilyMatches" :key="member.userId" 
              class="group bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col h-full"
            >
              <div class="flex items-center gap-4 mb-3">
                 <div class="relative shrink-0">
                    <img 
                      :src="member.avatarUrl || 'https://storage.googleapis.com/mou-welfare/web/logo.png'" 
                      class="w-12 h-12 rounded-full border-2 bg-white object-cover"
                      :class="getLightInfo(member.match?.light).border"
                    />
                    <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-50">
                        <Icon v-if="member.match?.light === 'GREEN'" icon="mingcute:check-circle-fill" class="text-green-500 text-lg" />
                        <Icon v-else-if="member.match?.light === 'RED'" icon="mingcute:close-circle-fill" class="text-red-500 text-lg" />
                        <Icon v-else icon="mingcute:warning-fill" class="text-yellow-500 text-lg" />
                    </div>
                 </div>
                 <div>
                    <h3 class="font-bold text-gray-800 text-lg leading-tight">{{ member.name || '家庭成員' }}</h3>
                    <span class="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" 
                          :class="[getLightInfo(member.match?.light).bg, getLightInfo(member.match?.light).color]">
                        {{ getLightInfo(member.match?.light).text }}
                    </span>
                 </div>
              </div>

              <div v-if="member.match?.reasons?.length > 0 && member.match.light !== 'GREEN'" class="flex-1">
                 <div class="bg-red-50/60 rounded-xl p-3 border border-red-100/50">
                    <ul class="space-y-1.5">
                       <li v-for="(reason, idx) in member.match.reasons" :key="idx" class="text-xs text-gray-700 font-medium flex items-start gap-1.5">
                          <Icon icon="mingcute:close-line" class="text-red-500 shrink-0 mt-0.5" />
                          <span>{{ reason }}</span>
                       </li>
                    </ul>
                 </div>
              </div>
              <div class="absolute bottom-0 left-0 right-0 h-1 opacity-50" :class="getLightInfo(member.match?.light).bg.replace('bg-', 'bg-')"></div>
            </div>
          </div>
      </div>

      <div v-if="data.summaryContent" class="bg-gradient-to-br from-[#F0FDF4] to-white border border-green-100/50 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group">
          <Icon icon="mingcute:ai-fill" class="absolute -right-6 -top-6 text-[10rem] text-green-500/5 rotate-12 transition-transform duration-700 group-hover:rotate-6 pointer-events-none" />
          <h2 class="text-lg font-bold text-mygreen mb-4 flex items-center gap-2 relative z-10">
            <Icon icon="mingcute:ai-line" class="text-xl" />
            AI 智慧重點摘要
          </h2>
          <div class="relative z-10 bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-green-50">
            <p class="text-gray-700 leading-relaxed text-justify tracking-wide font-medium">
              {{ data.summaryContent }}
            </p>
          </div>
      </div>

      <div class="bg-white rounded-3xl p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-50 space-y-8">
          
          <div v-if="data.requirements && data.requirements.length">
            <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg  text-mygreen">
                <Icon icon="mingcute:list-check-line" />
              </span>
              申請條件
            </h3>
            <ul class="space-y-3 pl-2">
              <li v-for="(req, i) in data.requirements" :key="i" class="flex items-start gap-3 group">
                <div class="mt-1 w-5 h-5 rounded-full border border-green-200 text-green-500 flex items-center justify-center bg-green-50 shrink-0 group-hover:bg-mygreen group-hover:text-white transition-colors">
                  <Icon icon="mingcute:check-line" class="text-xs" />
                </div>
                <span class="text-gray-600 group-hover:text-gray-900 transition-colors">{{ req }}</span>
              </li>
            </ul>
          </div>

          <div v-if="data.rewards && data.rewards.length">
            <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-3">
              <span class="flex items-center justify-center w-8 h-8 rounded-lg text-orange-500">
                <Icon icon="mingcute:gift-2-line" />
              </span>
              補助內容
            </h3>
            <div class="grid gap-3">
              <div v-for="(rew, i) in data.rewards" :key="i" class="flex items-center gap-3 p-3 bg-orange-50/50 rounded-xl border border-orange-100/50 text-gray-700">
                <Icon icon="mingcute:star-fill" class="text-orange-400 shrink-0" />
                <span class="font-medium">{{ rew }}</span>
              </div>
            </div>
          </div>

          <div class="h-px bg-gray-100 w-full"></div>

          <div class="border border-gray-100 rounded-2xl overflow-hidden">
            <button 
              @click="showOriginalContent = !showOriginalContent" 
              class="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            >
              <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
                <Icon icon="mingcute:file-text-line" class="text-gray-400 text-lg" />
                原始公告內容
              </h3>
              
              <Icon 
                icon="mingcute:down-line" 
                class="text-gray-400 text-lg transition-transform duration-300"
                :class="{ 'rotate-180': showOriginalContent }"
              />
            </button>
            
            <div v-show="showOriginalContent" class="bg-white border-t border-gray-100">
               <div class="text-gray-600 text-sm leading-loose whitespace-pre-wrap font-light p-6">
                 {{ data.originalContent }}
               </div>
            </div>
          </div>
      </div>

    </div>

    <div class="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 flex gap-3 md:hidden z-40 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
      <button @click="goToSource" class="flex-1 bg-mygreen text-white font-bold py-3.5 rounded-xl shadow-lg shadow-green-200 active:scale-95 transition-transform flex items-center justify-center gap-2">
        前往申辦
        <Icon icon="mingcute:external-link-line" />
      </button>
    </div>

  </div>
  
  <div v-else class="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
    <Icon icon="line-md:loading-loop" class="text-5xl text-mygreen/50" />
    <p class="text-gray-400 text-sm font-medium animate-pulse">正在讀取福利資料...</p>
  </div>
</template>

<style scoped>
/* 針對長文章的排版優化：保留換行與空白 */
.whitespace-pre-wrap {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>