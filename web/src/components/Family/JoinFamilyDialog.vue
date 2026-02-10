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

const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const familyStore = useFamilyStore()
const joinCode = ref('')
const isSubmitting = ref(false)

const handleClose = () => {
    joinCode.value = ''
    visible.value = false
}

const handleScanQr = () => {
    ElMessage.info('開啟相機掃描功能 (開發中)')
}

const submitJoin = async () => {
    if (!joinCode.value || joinCode.value.length !== 6) {
        ElMessage.warning('請輸入正確的 6 位數家庭代碼')
        return
    }

    isSubmitting.value = true
    try {
        await familyStore.joinViaCode({ code: joinCode.value })
        ElMessage.success('成功加入家庭！')
        emit('success')
        handleClose()
    } catch (error) {
        console.error(error)
        ElMessage.error('加入失敗，請檢查代碼是否正確')
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <el-dialog v-model="visible" title="加入家庭" width="90%" class="max-w-sm rounded-xl" align-center :show-close="true"
        @close="handleClose">
        <div class="flex flex-col items-center py-2">
            <div @click="handleScanQr"
                class="flex flex-col items-center justify-center gap-3 mb-6 cursor-pointer group">
                <div
                    class="relative w-24 h-24 flex items-center justify-center text-[#84cc16] transition-transform group-hover:scale-105">
                    <Icon icon="mingcute:scan-line" class="text-[5rem]" />
                </div>
                <span class="text-gray-800 font-medium">點擊開啟相機掃描 QR code</span>
            </div>

            <div class="relative w-full flex items-center justify-center mb-6">
                <div class="absolute w-full h-px bg-gray-200"></div>
                <span class="relative bg-white px-3 text-gray-400 text-sm">or</span>
            </div>

            <div class="w-full mb-6 text-center">
                <label class="block text-gray-800 font-bold mb-3 text-lg">輸入6位數家庭代碼</label>
                <div class="flex items-center gap-2 justify-center">
                    <span class="text-gray-600 font-bold">代碼：</span>
                    <input v-model="joinCode" type="text" maxlength="6"
                        class="border border-gray-400 rounded-lg px-2 py-1.5 w-40 text-center outline-none focus:border-[#84cc16] focus:ring-1 focus:ring-[#84cc16] transition-all" />
                </div>
            </div>

            <div class="flex gap-4 w-full justify-center">
                <button @click="handleClose"
                    class="flex-1 py-2 rounded-xl border border-[#84cc16] text-[#84cc16] font-bold hover:bg-green-50 transition active:scale-95">
                    取消
                </button>
                <button @click="submitJoin" :disabled="isSubmitting"
                    class="flex-1 py-2 rounded-xl bg-[#84cc16] text-white font-bold hover:bg-green-600 transition shadow-md shadow-green-100 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                    <Icon v-if="isSubmitting" icon="line-md:loading-loop" />
                    確定
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
