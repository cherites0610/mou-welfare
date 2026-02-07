<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getFaqs } from '@/api/utils'
import type { Faq } from '@/api/utils/model'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
const faqList = ref<Faq[]>([])
const loading = ref(true)
const activeNames = ref<string[]>([])
const router = useRouter()

const goBack = () => {
  router.back()
}
onMounted(async () => {
  try {
    loading.value = true
    const res = await getFaqs()
    if (Array.isArray(res)) {
      faqList.value = res.sort((a: Faq, b: Faq) => a.order_index - b.order_index)
      if (faqList.value.length > 0) {
        const firstId = faqList.value[0]?.id
        if (firstId) {
          activeNames.value = [firstId]
        }
      }
    }
  } catch (err) {
    console.error('載入常見問題失敗:', err)
  } finally {
    loading.value = false
  }
})
</script>
<template>
  <AppHeader class="hidden md:block mb-5" />
  <div
    class="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between md:hidden shadow-sm"
  >
    <button
      @click="goBack"
      class="p-1 -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
    >
      <Icon icon="mingcute:left-line" class="text-2xl" />
    </button>

    <span class="font-bold text-lg text-gray-800">常見問題</span>

    <div class="w-8"></div>
  </div>

<div class="flex flex-col h-[calc(100dvh-6rem)] md:h-[calc(100vh-8rem)] overflow-hidden px-4 sm:px-6 lg:px-8 mt-4 md:mt-0">
      <div class="max-w-3xl mx-auto">
      <div v-if="loading" class="space-y-4">
        <el-skeleton :rows="3" animated />
        <el-skeleton :rows="3" animated />
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else class="bg-white md:shadow overflow-hidden sm:rounded-lg">
        <el-collapse v-model="activeNames" class="border-none">
          <el-collapse-item
            v-for="item in faqList"
            :key="item.id"
            :name="item.id"
            class="px-4 sm:px-6"
          >
            <template #title>
              <div
                class="flex items-center gap-2 text-base sm:font-bold font-medium text-gray-800 hover:text-mygreen transition-colors py-2"
              >
                <span class="text-mygreen font-bold">Q:</span>
                {{ item.question }}
              </div>
            </template>

            <div class="text-gray-600 leading-relaxed text-sm sm:text-base py-2 pl-6">
              <span class="leading-8">{{ item.answer }}</span>
            </div>
          </el-collapse-item>
        </el-collapse>

        <div v-if="!loading && faqList.length === 0" class="p-10 text-center text-gray-400">
          目前暫無常見問題資訊
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 覆蓋 Element Plus 的部分預設樣式，使其更乾淨 */
:deep(.el-collapse) {
  border-top: none;
  border-bottom: none;
}

:deep(.el-collapse-item__header) {
  border-bottom: 1px solid #f3f4f6; /* Tailwind gray-100 */
  height: auto; /* 讓高度自適應，避免標題太長被切掉 */
  min-height: 48px;
  line-height: 1.5;
}

:deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid #f3f4f6;
}

:deep(.el-collapse-item:last-child .el-collapse-item__header),
:deep(.el-collapse-item:last-child .el-collapse-item__wrap) {
  border-bottom: none; /* 最後一個項目不要底線 */
}

/* 讓箭頭 icon 稍微大一點 */
:deep(.el-collapse-item__arrow) {
  font-size: 1.2rem;
  color: #9ca3af;
}
:deep(.el-collapse-item__content) {
  padding-bottom: 5px; /* 把原本的 25px 改成 0，或你想要的數值 */
}
</style>
