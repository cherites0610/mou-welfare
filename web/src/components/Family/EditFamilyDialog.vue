<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useFamilyStore } from '@/stores/family'
import type { Family } from '@/api/family/model'

const props = defineProps<{
  modelValue: boolean
  family: Family | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const familyStore = useFamilyStore()
const familyName = ref('')
const isSubmitting = ref(false)

watch(
  () => props.family,
  (f) => {
    familyName.value = f?.name ?? ''
  },
  { immediate: true },
)

const handleClose = () => {
  visible.value = false
}

const submitRename = async () => {
  if (!props.family) return
  if (!familyName.value.trim()) {
    ElMessage.warning('請輸入家庭名稱')
    return
  }
  if (familyName.value.trim() === props.family.name) {
    handleClose()
    return
  }

  isSubmitting.value = true
  try {
    await familyStore.renameFamily(props.family.id, { name: familyName.value.trim() })
    ElMessage.success('家庭名稱已更新')
    handleClose()
  } catch (error) {
    ElMessage.error('更新失敗，請稍後再試')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="編輯家庭名稱"
    width="90%"
    class="max-w-sm rounded-xl"
    align-center
    :show-close="true"
    @close="handleClose"
  >
    <div class="flex flex-col gap-4 py-4">
      <div>
        <label class="block text-gray-800 font-bold mb-2">家庭名稱</label>
        <el-input v-model="familyName" placeholder="請輸入家庭名稱" size="large">
          <template #prefix>
            <Icon icon="mingcute:home-6-line" class="text-gray-400" />
          </template>
        </el-input>
      </div>

      <div class="flex gap-3 mt-4">
        <button
          @click="handleClose"
          class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition"
        >
          取消
        </button>
        <button
          @click="submitRename"
          :disabled="isSubmitting"
          class="flex-1 py-2.5 rounded-xl bg-[#84cc16] text-white font-bold hover:bg-green-600 transition shadow-md shadow-green-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon v-if="isSubmitting" icon="line-md:loading-loop" />
          儲存
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
@media screen and (max-width: 768px) {
  :deep(.el-input__inner) {
    font-size: 16px !important;
  }
  :deep(.el-input__wrapper) {
    font-size: 16px !important;
  }
}
</style>
