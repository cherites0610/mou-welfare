<!-- 常見問題：沿用 v1 web/src/views/question/index.vue；內容從 v1 資料庫搬移後寫死在前端（utils/faqs.ts） -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: false })

const router = useRouter()
// 與 v1 相同，第一題預設展開
const activeNames = ref<number[]>([0])

const goBack = () => {
  router.back()
}

useHead({
  title: '常見問題 | 哞福利',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      }),
    },
  ],
})
</script>
<template>
  <AppHeader class="hidden md:block mb-5" />

  <!-- 手機版 Header (完全不動) -->
  <div
    class="sticky top-0 z-40 border-b border-gray-100 px-6 h-14 flex items-center justify-between md:hidden shadow-sm bg-white">
    <button @click="goBack" class="p-1 -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
      <Icon icon="mingcute:left-line" class="text-2xl" />
    </button>
    <span class="font-bold text-lg text-gray-800">常見問題</span>
    <div class="w-8"></div>
  </div>

  <!-- 內容區塊：電腦版加上非常淺的灰底，襯托中間的純白區塊 -->
  <div
    class="flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-6rem)] overflow-y-auto px-4 sm:px-6 lg:px-8 mt-4 md:mt-0 md:bg-[#fcfcfc] pb-12">

    <!-- 🌟 電腦版專屬置中大標題：乾淨俐落 -->
    <div class="hidden md:flex flex-col items-center justify-center pt-10 pb-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">常見問題</h1>
      <p class="text-gray-500">找不到答案嗎？您可以隨時在聊天室詢問阿哞</p>
    </div>

    <!-- 🌟 閱讀區塊：限制最大寬度為 3xl (最適合閱讀的寬度)，電腦版加上純白背景與極淡的邊框 -->
    <div class="w-full max-w-7xl md:max-w-3xl mx-auto md:bg-white md:border md:border-gray-100 md:rounded-2xl md:p-8 md:shadow-sm">

      <div class="w-full">
        <el-collapse v-model="activeNames" class="clean-collapse">
          <el-collapse-item v-for="(item, i) in FAQS" :key="i" :name="i" class="px-0 sm:px-2">

            <!-- 標題 -->
            <template #title>
              <div class="flex items-start gap-3 text-base sm:font-bold font-medium text-gray-800 hover:text-[#84cc16] transition-colors py-3 md:py-4 w-full md:text-lg">
                <span class="text-[#84cc16] font-bold mt-0.5">Q.</span>
                <span class="leading-snug text-left break-words flex-1">{{ item.question }}</span>
              </div>
            </template>

            <!-- 解答 -->
            <div class="text-gray-600 leading-relaxed text-sm sm:text-base py-2 pl-7 md:pl-8 md:pb-6 flex gap-3">
              <span class="text-gray-400 font-bold hidden md:inline-block">A.</span>
              <p class="flex-1">{{ item.answer }}</p>
            </div>

          </el-collapse-item>
        </el-collapse>

        <!-- 空狀態 -->
        <div v-if="FAQS.length === 0" class="p-16 flex flex-col items-center justify-center text-gray-400">
          <Icon icon="mingcute:inbox-line" class="text-4xl mb-2 text-gray-300" />
          <p>目前暫無常見問題資訊</p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/*
  覆蓋 Element Plus 預設的樣式，改為極簡風格
  拔掉所有多餘的外框，只保留項目之間的細緻底線
*/
:deep(.clean-collapse) {
  border-top: none;
  border-bottom: none;
}
:deep(.clean-collapse .el-collapse-item__header) {
  border-bottom: none;
  height: auto;
  line-height: normal;
  background-color: transparent;
}
:deep(.clean-collapse .el-collapse-item__wrap) {
  border-bottom: 1px solid #f3f4f6; /* 極淺的灰線 */
  background-color: transparent;
}
:deep(.clean-collapse .el-collapse-item:last-child .el-collapse-item__wrap) {
  border-bottom: none; /* 最後一項不要線 */
}
:deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
</style>
