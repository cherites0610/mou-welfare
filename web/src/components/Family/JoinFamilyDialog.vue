<script setup lang="ts">
import { useFamilyStore } from '@/stores/family'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import jsQR from 'jsqr'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const familyStore = useFamilyStore()
const joinCode = ref('')
const isSubmitting = ref(false)

const scanning = ref(false)
const cameraError = ref('')
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let stream: MediaStream | null = null
let rafId: number | null = null

const stopCamera = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  scanning.value = false
}

const scanFrame = () => {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
    rafId = requestAnimationFrame(scanFrame)
    return
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(imageData.data, imageData.width, imageData.height)

  if (result?.data) {
    joinCode.value = result.data.trim().slice(0, 6)
    stopCamera()
    ElMessage.success('QR Code 掃描成功')
    return
  }

  rafId = requestAnimationFrame(scanFrame)
}

const handleScanQr = async () => {
  cameraError.value = ''
  scanning.value = true

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })

    await nextTick()

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
    }

    rafId = requestAnimationFrame(scanFrame)
  } catch (err: any) {
    scanning.value = false
    if (err.name === 'NotAllowedError') {
      cameraError.value = '相機權限被拒絕，請在瀏覽器設定中允許存取相機'
    } else if (err.name === 'NotFoundError') {
      cameraError.value = '找不到相機裝置'
    } else {
      cameraError.value = '無法開啟相機，請確認裝置支援'
    }
  }
}

const handleClose = () => {
  stopCamera()
  joinCode.value = ''
  cameraError.value = ''
  visible.value = false
}

watch(visible, (val) => {
  if (!val) stopCamera()
})

onUnmounted(() => stopCamera())

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
    ElMessage.error('加入失敗，請檢查代碼是否正確')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="加入家庭"
    width="90%"
    class="max-w-sm rounded-xl"
    align-center
    :show-close="true"
    @close="handleClose"
  >
    <div class="flex flex-col items-center py-2">

      <div v-if="!scanning" @click="handleScanQr"
        class="flex flex-col items-center justify-center gap-3 mb-6 cursor-pointer group">
        <div class="relative w-24 h-24 flex items-center justify-center text-[#84cc16] transition-transform group-hover:scale-105">
          <Icon icon="mingcute:scan-line" class="text-[5rem]" />
        </div>
        <span class="text-gray-800 font-medium">點擊開啟相機掃描 QR code</span>
      </div>

      <div v-if="scanning" class="w-full mb-6">
        <div class="relative w-full rounded-xl overflow-hidden bg-black aspect-square">
          <video ref="videoRef" class="w-full h-full object-cover" playsinline muted />

          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="w-48 h-48 relative">
              <span class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#92c700] rounded-tl-lg" />
              <span class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#92c700] rounded-tr-lg" />
              <span class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#92c700] rounded-bl-lg" />
              <span class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#92c700] rounded-br-lg" />
              <div class="scan-line absolute left-2 right-2 h-0.5 bg-[#92c700] shadow-[0_0_6px_#92c700]" />
            </div>
          </div>
        </div>

        <button
          @click="stopCamera"
          class="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
        >
          <Icon icon="mingcute:close-circle-line" class="text-base" />
          取消掃描
        </button>

        <canvas ref="canvasRef" class="hidden" />
      </div>

      <p v-if="cameraError" class="text-red-500 text-xs text-center mb-4">
        <Icon icon="mingcute:warning-line" class="inline mr-1" />{{ cameraError }}
      </p>

      <div class="relative w-full flex items-center justify-center mb-6">
        <div class="absolute w-full h-px bg-gray-200" />
        <span class="relative bg-white px-3 text-gray-400 text-sm">or</span>
      </div>

      <div class="w-full mb-6 text-center">
        <label class="block text-gray-800 font-bold mb-3 text-lg">輸入6位數家庭代碼</label>
        <div class="flex items-center gap-2 justify-center">
          <span class="text-gray-600 font-bold">代碼：</span>
          <input
            v-model="joinCode"
            type="text"
            maxlength="6"
            class="border border-gray-400 rounded-lg px-2 py-1.5 w-40 text-center outline-none focus:border-[#84cc16] focus:ring-1 focus:ring-[#84cc16] transition-all font-mono tracking-widest text-lg"
          />
        </div>
      </div>

      <div class="flex gap-4 w-full justify-center">
        <button
          @click="handleClose"
          class="flex-1 py-2 rounded-xl border border-[#84cc16] text-[#84cc16] font-bold hover:bg-green-50 transition active:scale-95"
        >
          取消
        </button>
        <button
          @click="submitJoin"
          :disabled="isSubmitting"
          class="flex-1 py-2 rounded-xl bg-[#84cc16] text-white font-bold hover:bg-green-600 transition shadow-md shadow-green-100 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Icon v-if="isSubmitting" icon="line-md:loading-loop" />
          確定
        </button>
      </div>

    </div>
  </el-dialog>
</template>

<style scoped>
.scan-line {
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0%   { top: 8px; }
  50%  { top: calc(100% - 8px); }
  100% { top: 8px; }
}

@media screen and (max-width: 768px) {
  :deep(.el-input__inner) { font-size: 16px !important; }
  :deep(.el-input__wrapper) { font-size: 16px !important; }
}
</style>
