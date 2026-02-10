<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useFamilyStore } from '@/stores/family'

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'success'): void
}>()

// 雙向綁定 Dialog
const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const familyStore = useFamilyStore()
const createFamilyName = ref('')
const isSubmitting = ref(false)

// 關閉重置
const handleClose = () => {
    createFamilyName.value = ''
    visible.value = false
}

const submitCreate = async () => {
    if (!createFamilyName.value.trim()) {
        ElMessage.warning('請輸入家庭名稱')
        return
    }

    isSubmitting.value = true
    try {
        await familyStore.createNewFamily({ name: createFamilyName.value })
        await familyStore.loadFamilies()

        ElMessage.success('創建成功！')
        emit('success')
        handleClose()
    } catch (error) {
        console.error(error)
        ElMessage.error('創建失敗，請稍後再試')
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <el-dialog v-model="visible" title="創建新家庭" width="90%" class="max-w-sm rounded-xl" align-center :show-close="true"
        @close="handleClose">
        <div class="flex flex-col gap-4 py-4">
            <div>
                <label class="block text-gray-800 font-bold mb-2">家庭名稱</label>
                <el-input v-model="createFamilyName" placeholder="Ex：快樂廖家" size="large">
                    <template #prefix>
                        <Icon icon="mingcute:edit-line" class="text-gray-400" />
                    </template>
                </el-input>
            </div>

            <div class="flex gap-3 mt-4">
                <button @click="handleClose"
                    class="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition">
                    取消
                </button>
                <button @click="submitCreate" :disabled="isSubmitting"
                    class="flex-1 py-2.5 rounded-xl bg-[#84cc16] text-white font-bold hover:bg-green-600 transition shadow-md shadow-green-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Icon v-if="isSubmitting" icon="line-md:loading-loop" />
                    立即創建
                </button>
            </div>
        </div>
    </el-dialog>
</template>

<style scoped>

@media screen and (max-width: 768px) {

    /* 針對 Element Plus 的 input 內部元素強制設定 16px */
    :deep(.el-input__inner) {
        font-size: 16px !important;
    }

    /* 有些版本的 Element Plus 字體是設定在 wrapper 上，保險起見也加上 */
    :deep(.el-input__wrapper) {
        font-size: 16px !important;
    }
}
</style>
