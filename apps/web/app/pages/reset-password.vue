<!-- 沿用 v1 web/src/views/reset-password/index.vue；token 由重設密碼信的連結帶入（?token=）。
     ?mode=set：第三方登入的帳號第一次設定密碼（個人設定頁發出），只改文字 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: false })
const router = useRouter()
const route = useRoute()
const isSet = computed(() => route.query.mode === 'set')
const verb = computed(() => (isSet.value ? '設定' : '重設'))
useHead({ title: () => `密碼${verb.value} | 哞福利`, meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const token = computed(() => (route.query.token as string | undefined) ?? '')
const linkError = computed(() => route.query.error === 'INVALID_TOKEN' || !token.value)

const loading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)

const form = reactive({ newPassword: '', confirmPassword: '' })

const handleSubmit = async () => {
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
  const { error } = await useAuth().resetPassword({ newPassword: form.newPassword, token: token.value })
  loading.value = false
  if (error) {
    errorMsg.value = authErrorMessage(error, `${verb.value}失敗，連結可能已過期`)
    return
  }
  ElMessage.success(`密碼已${verb.value}成功，請重新登入`)
  router.push('/login')
}
</script>

<template>
  <AuthCard>
    <div class="flex items-center gap-2 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600 transition-colors">
        <Icon icon="mingcute:arrow-left-line" class="text-xl" />
      </button>
      <h2 class="text-xl font-bold text-gray-800">密碼{{ verb }}</h2>
    </div>

    <div v-if="linkError" class="space-y-4 text-center">
      <p class="text-sm text-gray-600">{{ verb }}連結無效或已過期，請重新申請。</p>
      <button @click="router.push('/forgot-password')"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] text-white font-bold rounded-full transition-colors">
        重新申請
      </button>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="space-y-4">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:lock-line" class="text-lg" />
        </span>
        <input v-model="form.newPassword" :type="showPassword ? 'text' : 'password'" placeholder="請輸入新密碼"
          autocomplete="new-password"
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
          autocomplete="new-password"
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
