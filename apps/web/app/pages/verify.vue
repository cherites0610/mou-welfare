<!-- 沿用 v1 web/src/views/verify/index.vue 的版面；v2 改為寄送驗證「連結」，不需輸入驗證碼 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: false })
useHead({ title: '驗證信箱 | 哞福利', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const router = useRouter()
const route = useRoute()

const flow = computed(() => (route.query.flow === 'reset' ? 'reset' : 'register'))
const email = computed(() => (route.query.email as string | undefined) ?? '')

onMounted(() => {
  if (!email.value) router.replace(flow.value === 'reset' ? '/forgot-password' : '/register')
})

const resending = ref(false)
const countdown = ref(60)
let timer: ReturnType<typeof setInterval> | null = null

const startCountdown = () => {
  countdown.value = 60
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
}
onMounted(startCountdown)
onBeforeUnmount(() => timer && clearInterval(timer))

const maskedEmail = computed(() => {
  const [local, domain] = email.value.split('@')
  if (!local || !domain) return email.value
  return `${local.slice(0, 3)}${'*'.repeat(Math.max(local.length - 3, 3))}@${domain}`
})

const handleResend = async () => {
  if (!email.value || countdown.value > 0) return
  resending.value = true
  const auth = useAuth()
  const { error } =
    flow.value === 'register'
      ? await auth.sendVerificationEmail({ email: email.value, callbackURL: absoluteUrl('/register/profile') })
      : await auth.requestPasswordReset({ email: email.value, redirectTo: absoluteUrl('/reset-password') })
  resending.value = false
  if (error) {
    ElMessage.error(authErrorMessage(error, '發送失敗，請稍後再試'))
    return
  }
  ElMessage.success('信件已重新發送')
  startCountdown()
}
</script>

<template>
  <AuthCard>
    <div class="flex items-center gap-2 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600 transition-colors">
        <Icon icon="mingcute:arrow-left-line" class="text-xl" />
      </button>
      <h2 class="text-xl font-bold text-gray-800">{{ flow === 'register' ? '驗證信箱' : '重設密碼' }}</h2>
    </div>

    <div class="flex flex-col items-center py-6 mb-2">
      <div class="w-16 h-16 rounded-full bg-lime-50 flex items-center justify-center mb-4">
        <Icon icon="mingcute:mail-send-line" class="text-3xl text-mygreen" />
      </div>
      <p class="text-sm text-gray-600 text-center">{{ flow === 'register' ? '驗證信' : '重設密碼信' }}已寄至</p>
      <p class="text-base font-semibold text-gray-800 mt-1">{{ maskedEmail }}</p>
    </div>

    <div class="space-y-4">
      <p class="text-sm text-gray-600 text-center leading-relaxed">
        請開啟信件並點擊{{ flow === 'register' ? '「驗證信箱」' : '「重設密碼」' }}按鈕，<br />
        連結 1 小時內有效。
      </p>

      <button @click="router.push('/login')"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] text-white font-bold rounded-full transition-colors">
        返回登入
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
