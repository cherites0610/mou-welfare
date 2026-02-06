<script setup lang="ts">
import { computed } from 'vue'
import type { WelfareResponse } from '../api/welfare/model'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  data: WelfareResponse
  favoritesWelfareIds: Set<string>
}>()

console.log(props.favoritesWelfareIds)

// 🚦 1. 處理左側燈號顏色 (根據 match.light)
const statusColor = computed(() => {
  const light = props.data.match?.light || 'RED'
  switch (light) {
    case 'GREEN':
      return 'bg-mygreen'
    case 'YELLOW':
      return 'bg-myyellow'
    default:
      return 'bg-myred'
  }
})

// 處理標籤顏色
const tagColorMap: Record<string, string> = {
  '20歲以下': 'bg-myorange',
  '20歲-65歲': 'bg-myorange',
  '65歲以上': 'bg-myorange',
  男性: 'bg-myblue',
  女性: 'bg-myblue',
  中低收入戶: 'bg-mypurple',
  低收入戶: 'bg-mypurple',
  榮民: 'bg-myblue-green',
  身心障礙者: 'bg-myblue-green',
  原住民: 'bg-myblue-green',
  外籍配偶家庭: 'bg-myblue-green',
}
// 取得標籤顏色的函式
const getTagColor = (tagName: string) => {
  // 如果找不到對應的顏色，就回傳預設灰 (bg-gray-400)
  return tagColorMap[tagName] || 'bg-gray-400'
}
// 取得第一分類 (避免分類太多太長)
const mainCategory = computed(() => props.data.categories?.[0] || '一般福利')

const visibleFamilyMatches = computed(() => {
  return props.data.familyMatches || []
})

// 輔助函式 (維持不變)
const getMemberBorderColor = (light: string) => {
  switch (light) {
    case 'GREEN': return 'border-green-500 bg-green-50'
    case 'YELLOW': return 'border-yellow-400 bg-yellow-50'
    default: return 'border-red-400 bg-red-50'
  }
}

// Header 按鈕事件
const collect = () => console.log('收藏')
const question = () => console.log('常見問題')
</script>

<template>
  <div class="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar ">
    <div
      class="w-full min-w-full snap-center group flex items-end md:items-center gap-4 pt-3 pb-3 px-4 bg-white transition-all duration-300 cursor-pointer hover:shadow-md"
    >
      <div v-if="data.match?.light"
        class="w-4 h-4 rounded-full shrink-0 shadow-sm order-last md:order-first mb-1 md:mb-0" :class="statusColor">
      </div>

      <div class="flex-1 flex flex-col gap-3 pt-3 pb-3">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-gray-500 text-sm tracking-wide">
            {{ data.sourceCity }}/{{ mainCategory }}
          </span>

          <div class="hidden md:flex flex-wrap gap-2">
            <span
              v-for="tag in data.identity"
              :key="tag"
              class="px-2.5 py-0.5 rounded text-white text-sm font-medium tracking-wide shadow-sm"
              :class="getTagColor(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <h3
          class="text-lg text-gray-800 font-bold leading-relaxed group-hover:text-mygreen transition-colors"
        >
          {{ data.name }}
        </h3>
      </div>

      <div class="hidden md:flex  gap-3 ml-auto pl-2  border-gray-100">
        <Icon
          icon="mdi:heart-outline"
          class="text-2xl text-gray-400 hover:text-red-500 transition-colors mt-0.5"
          @click.stop="collect"
        />
        <Icon
          icon="uil:share"
          class="text-2xl text-gray-400 hover:text-mygreen transition-colors"
          @click.stop="question"
        />
      </div>
    </div>
    <div v-if="visibleFamilyMatches.length > 0" class="flex items-start gap-2 mt-1">
      <span class="text-xs text-gray-400 mt-2 shrink-0">家人適用：</span>

      <div class="flex flex-wrap -space-x-2 py-1 pl-1">

        <div v-for="member in visibleFamilyMatches" :key="member.userId" class="relative group/avatar"
          :title="member.name || '家庭成員'">
          <img :src="member.avatarUrl || 'https://storage.googleapis.com/mou-welfare/web/logo.png'" alt="Avatar"
            class="w-8 h-8 rounded-full border-2 object-cover bg-white shadow-sm transition-transform hover:scale-110 hover:z-10"
            :class="getMemberBorderColor(member.match?.light || 'RED')" />

          <div
            class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/avatar:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
            {{ member.match?.score || 0 }}分
          </div>
        </div>

      </div>
    </div>

    <div class="flex md:hidden snap-center">
      <div
        class="w-20 bg-gray-100 flex flex-col items-center justify-center text-gray-500 active:bg-red-100 active:text-red-500 transition-colors"
        @click.stop="collect"
      >
        <Icon icon="mdi:heart-outline" class="text-2xl mb-1" />
      </div>

      <div
        class="w-20 bg-mygreen text-white flex flex-col items-center justify-center active:bg-green-700 transition-colors"
        @click.stop="question"
      >
        <Icon icon="uil:share" class="text-2xl mb-1" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隱藏橫向捲軸 (Chrome, Safari, Opera) */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
/* 隱藏橫向捲軸 (IE, Edge, Firefox) */
.no-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>
