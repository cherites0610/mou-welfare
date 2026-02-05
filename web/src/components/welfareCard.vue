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

// 處理標籤顏色 (模擬圖片中的多彩標籤)
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

// Header 按鈕事件
const collect = () => console.log('收藏')
const question = () => console.log('常見問題')
</script>

<template>
  <div class="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar rounded-xl">
    <div
      class="w-full min-w-full snap-center group flex items-end md:items-center gap-4 pt-3 pb-3 px-4 bg-white transition-all duration-300 cursor-pointer hover:shadow-md"
    >
      <div
        class="w-4 h-4 rounded-full shrink-0 shadow-sm order-last md:order-first md:mb-0"
        :class="statusColor"
      ></div>

      <div class="flex-1 flex flex-col gap-3">
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

      <div class="hidden md:flex flex-col gap-3 ml-auto pl-2 border-l border-gray-100">
        <Icon
          icon="mdi:heart-outline"
          class="text-2xl text-gray-400 hover:text-red-500 transition-colors"
          @click.stop="collect"
        />
        <Icon
          icon="uil:share"
          class="text-2xl text-gray-400 hover:text-mygreen transition-colors"
          @click.stop="question"
        />
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
