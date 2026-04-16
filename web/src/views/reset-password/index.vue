<script setup lang="ts">
import { resetPassword } from '@/api/user'
import AuthCard from '@/components/auth/AuthCard.vue'
import { Icon } from '@iconify/vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)

const form = reactive({
  newPassword: '',
  confirmPassword: '',
})

interface AuthState {
  flow: string
  email: string
  verificationCode: string
}

let authState: AuthState | null = null

onMounted(() => {
  const raw = sessionStorage.getItem('mou_auth_state')
  if (!raw) {
    router.replace('/forgot-password')
    return
  }
  authState = JSON.parse(raw)
  if (authState?.flow !== 'forgot-password') {
    router.replace('/forgot-password')
  }
})

const handleSubmit = async () => {
  if (!authState) return

  if (!form.newPassword || !form.confirmPassword) {
    errorMsg.value = '請填寫所有欄位'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    errorMsg.value = '兩次密碼輸入不一致'
    return
  }
  if (form.newPassword.length < 8) {
    errorMsg.value = '密碼至少需要 8 個字元'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    await resetPassword({
      email: authState.email,
      verificationCode: authState.verificationCode,
      newPassword: form.newPassword,
    })
    sessionStorage.removeItem('mou_auth_state')
    ElMessage.success('密碼已重設成功，請重新登入')
    router.push('/login')
  } catch (err: any) {
    errorMsg.value = err.message || '重設失敗，請確認驗證碼是否正確'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthCard>
    <div class="flex items-center gap-2 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600 transition-colors">
        <Icon icon="mingcute:arrow-left-line" class="text-xl" />
      </button>
      <h2 class="text-xl font-bold text-gray-800">密碼重設</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:lock-line" class="text-lg" />
        </span>
        <input v-model="form.newPassword" :type="showPassword ? 'text' : 'password'" placeholder="請輸入新密碼"
          class="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
        <button type="button" @click="showPassword = !showPassword"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <Icon :icon="showPassword ? 'mingcute:eye-close-line' : 'mingcute:eye-line'" class="text-lg" />
        </button>
      </div>

      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:refresh-2-line" class="text-lg" />
        </span>
        <input v-model="form.confirmPassword" :type="showConfirm ? 'text' : 'password'" placeholder="請再次輸入新密碼"
          class="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
        <button type="button" @click="showConfirm = !showConfirm"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <Icon :icon="showConfirm ? 'mingcute:eye-close-line' : 'mingcute:eye-line'" class="text-lg" />
        </button>
      </div>

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button type="submit" :disabled="loading"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors">
        {{ loading ? '重設中...' : '確定' }}
      </button>
    </form>
  </AuthCard>
</template>
