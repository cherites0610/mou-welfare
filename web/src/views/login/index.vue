<script setup lang="ts">
import { getGoogleLoginUrl, getLineLoginUrl } from '@/api/user'
import AuthCard from '@/components/auth/AuthCard.vue'
import { useAppInit } from '@/composables/useAppInit'
import { useUserStore } from '@/stores/user'
import { Icon } from '@iconify/vue'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

const userStore = useUserStore()
const { initAppData, clearAppData, startFamilyPolling } = useAppInit()

const loading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)

const isEmailDisabled = computed(() => !!route.query.email)

const form = reactive({
  email: (route.query.email as string) || '',
  password: '',
  rememberMe: false,
})

const handleLogin = async () => {
  if (!form.email || !form.password) {
    errorMsg.value = '請輸入帳號與密碼'
    return
  }

  loading.value = true
  errorMsg.value = ''
  clearAppData()

  try {
    await userStore.userLogin({ email: form.email, password: form.password })
    await initAppData()
    startFamilyPolling()
    const redirect = route.query.redirect as string
    router.push(redirect || '/welfares')
  } catch (err: any) {
    errorMsg.value = err.message || '登入失敗，請檢查帳號密碼'
    clearAppData()
  } finally {
    loading.value = false
  }
}

const handleGoogleLogin = async () => {
  try {
    const { url } = await getGoogleLoginUrl()
    window.location.href = url
  } catch {
    errorMsg.value = '無法取得 Google 登入連結，請稍後再試'
  }
}

const handleLineLogin = async () => {
  try {
    const { url } = await getLineLoginUrl()
    window.location.href = url
  } catch {
    errorMsg.value = '無法取得 LINE 登入連結，請稍後再試'
  }
}
</script>

<template>
  <AuthCard>
    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Sign up</h2>

    <form @submit.prevent="handleLogin" class="space-y-4">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mdi:email-outline" class="text-lg" />
        </span>
        <input v-model="form.email" type="email" placeholder="請輸入帳號"
          :disabled="isEmailDisabled"
          class="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-lg text-sm outline-none transition-colors"
          :class="isEmailDisabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'focus:border-mygreen'" />
      </div>

      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:lock-line" class="text-lg" />
        </span>
        <input v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="請輸入密碼"
          class="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
        <button type="button" @click="showPassword = !showPassword"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <Icon :icon="showPassword ? 'mingcute:eye-close-line' : 'mingcute:eye-line'" class="text-lg" />
        </button>
      </div>

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button type="submit" :disabled="loading"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors">
        {{ loading ? '登入中...' : '登入' }}
      </button>
    </form>

    <div class="mt-3 text-center">
      <button @click="router.push('/forgot-password')" class="text-sm text-mygreen hover:underline">
        忘記密碼
      </button>
    </div>

    <div class="mt-5">
      <p class="text-xs text-gray-400 text-center mb-3">其餘登入方式</p>
      <div class="flex justify-center gap-4">
        <button @click="handleGoogleLogin"
          class="w-10 h-10 rounded-full bg-mygreen flex items-center justify-center hover:bg-[#7dab00] transition-colors">
          <Icon icon="logos:google-icon" class="text-lg" />
        </button>
        <button @click="handleLineLogin"
          class="w-10 h-10 rounded-full bg-mygreen flex items-center justify-center hover:bg-[#7dab00] transition-colors">
          <Icon icon="simple-icons:line" class="text-lg text-white" />
        </button>
      </div>
    </div>

    <div class="flex items-center gap-2 mt-5">
      <div class="flex-1 h-px bg-gray-200" />
      <span class="text-xs text-gray-400">or</span>
      <div class="flex-1 h-px bg-gray-200" />
    </div>

    <div class="mt-3 text-center">
      <button @click="router.push('/register')" class="text-sm text-mygreen hover:underline font-medium">
        創建帳號
      </button>
    </div>

    <div class="mt-6 text-center">
      <button @click="router.push('/welfares')"
        class="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        <Icon icon="mingcute:left-line" class="text-sm" />
        回首頁
      </button>
    </div>
  </AuthCard>
</template>
