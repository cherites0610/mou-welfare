<script setup lang="ts">
import AuthCard from '@/components/auth/AuthCard.vue'
import { forgotPassword, resendVerification } from '@/api/user'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const resending = ref(false)
const errorMsg = ref('')
const code = ref('')
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const startCountdown = () => {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!)
      countdownTimer = null
    }
  }, 1000)
}

interface AuthState {
  flow: 'register' | 'forgot-password'
  email: string
  password?: string
  name?: string
}

const authState = ref<AuthState | null>(null)

onMounted(() => {
  const raw = sessionStorage.getItem('mou_auth_state')
  if (!raw) {
    router.replace('/login')
    return
  }
  authState.value = JSON.parse(raw)
})

const maskedEmail = computed(() => {
  const email = authState.value?.email ?? ''
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, 3)
  return `${visible}${'*'.repeat(Math.max(local.length - 3, 3))}@${domain}`
})

const handleResend = async () => {
  if (!authState.value?.email || countdown.value > 0) return
  resending.value = true
  try {
    if (authState.value.flow === 'register') {
      await resendVerification(authState.value.email)
    } else {
      await forgotPassword(authState.value.email)
    }
    ElMessage.success('驗證碼已重新發送')
    startCountdown()
  } catch (err: any) {
    ElMessage.error(err.message || '發送失敗，請稍後再試')
  } finally {
    resending.value = false
  }
}

const handleContinue = async () => {
  if (!code.value.trim()) {
    errorMsg.value = '請輸入驗證碼'
    return
  }

  const raw = sessionStorage.getItem('mou_auth_state')
  if (!raw) return
  const state = JSON.parse(raw)
  sessionStorage.setItem('mou_auth_state', JSON.stringify({ ...state, verificationCode: code.value.trim() }))

  if (authState.value?.flow === 'register') {
    router.push('/register/profile')
  } else {
    router.push('/reset-password')
  }
}
</script>

<template>
  <AuthCard>
    <div class="flex items-center gap-2 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600 transition-colors">
        <Icon icon="mingcute:arrow-left-line" class="text-xl" />
      </button>
      <h2 class="text-xl font-bold text-gray-800">寄送驗證碼</h2>
    </div>

    <div class="flex flex-col items-center py-6 mb-2">
      <div class="w-16 h-16 rounded-full bg-lime-50 flex items-center justify-center mb-4">
        <Icon icon="mingcute:mail-send-line" class="text-3xl text-mygreen" />
      </div>
      <p class="text-sm text-gray-600 text-center">驗證碼已寄至</p>
      <p class="text-base font-semibold text-gray-800 mt-1">{{ maskedEmail }}</p>
    </div>

    <div class="space-y-4">
      <input v-model="code" type="text" placeholder="請輸入 6 位數驗證碼" maxlength="6"
        class="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors tracking-widest text-center font-mono" />

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button @click="handleContinue" :disabled="loading"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors">
        繼續
      </button>

      <p class="text-xs text-gray-400 text-center">
        沒有收到信件？請確認垃圾郵件資料夾，或
        <button @click="handleResend" :disabled="resending || countdown > 0"
          class="font-medium disabled:cursor-not-allowed transition-colors"
          :class="countdown > 0 ? 'text-gray-400' : 'text-mygreen hover:underline'">
          {{ resending ? '發送中...' : countdown > 0 ? `重新發送 (${countdown}s)` : '重新發送' }}
        </button>
      </p>
    </div>
  </AuthCard>
</template>
