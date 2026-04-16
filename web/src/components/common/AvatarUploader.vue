<script setup lang="ts">
import { uploadImage } from '@/api/utils'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'

const DEFAULT_AVATAR = 'https://storage.googleapis.com/mou-welfare/web/meta.png'

const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [url: string]
}>()

const uploading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const triggerInput = () => {
  if (!uploading.value) inputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.error('請選擇圖片檔案')
    return
  }

  uploading.value = true
  try {
    const res = await uploadImage(file)
    emit('update:modelValue', res.url)
  } catch {
    ElMessage.error('上傳失敗，請稍後再試')
  } finally {
    uploading.value = false
    if (inputRef.value) inputRef.value.value = ''
  }
}
</script>

<template>
  <div class="relative w-20 h-20 cursor-pointer group" @click="triggerInput">
    <div class="w-full h-full rounded-full overflow-hidden border-2 border-gray-100 bg-gray-50">
      <img :src="modelValue || DEFAULT_AVATAR" class="w-full h-full object-cover" />
    </div>

    <div class="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
      <Icon v-if="!uploading" icon="mingcute:camera-line" class="text-white text-2xl" />
      <Icon v-else icon="mingcute:loading-3-line" class="text-white text-2xl animate-spin" />
    </div>

    <input
      ref="inputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileChange"
    />
  </div>
</template>
