<!-- 沿用 v1 web/src/views/register/index.vue；送出後由 Better Auth 註冊並寄出驗證連結 -->
<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: false, middleware: 'guest' })
useHead({ title: '創建帳號 | 哞福利', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)

const form = reactive({ email: '', password: '', confirmPassword: '' })

interface StrengthLevel {
  score: number
  label: string
  color: string
}

const passwordStrength = computed<StrengthLevel>(() => {
  const p = form.password
  if (!p) return { score: 0, label: '', color: '' }

  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++

  if (score <= 1) return { score: 1, label: '弱', color: 'bg-red-400' }
  if (score <= 2) return { score: 2, label: '普通', color: 'bg-orange-400' }
  if (score <= 3) return { score: 3, label: '良好', color: 'bg-yellow-400' }
  return { score: 4, label: '強', color: 'bg-mygreen' }
})

const handleSubmit = async () => {
  if (!form.password || !form.email) {
    errorMsg.value = '請填寫所有欄位'
    return
  }
  if (form.password !== form.confirmPassword) {
    errorMsg.value = '兩次密碼輸入不一致'
    return
  }
  if (form.password.length < 8) {
    errorMsg.value = '密碼至少需要 8 個字元'
    return
  }

  loading.value = true
  errorMsg.value = ''

  // 姓名在下一步「填寫個人資料」填寫，這裡先用信箱名稱
  const { error } = await useAuth().signUp.email({
    email: form.email,
    password: form.password,
    name: form.email.split('@')[0] || '新會員',
    callbackURL: absoluteUrl('/register/profile'),
  })
  loading.value = false
  if (error) {
    errorMsg.value = authErrorMessage(error, '註冊失敗，請確認信箱是否正確')
    return
  }
  router.push({ path: '/verify', query: { flow: 'register', email: form.email } })
}
</script>

<template>
  <AuthCard>
    <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Register</h2>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- 信箱 -->
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:mail-line" class="text-lg" />
        </span>
        <input v-model="form.email" type="email" placeholder="請輸入信箱" autocomplete="email"
          class="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-lg text-sm outline-none transition-colors focus:border-mygreen" />
      </div>

      <!-- 密碼 -->
      <div class="space-y-1.5">
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Icon icon="mingcute:lock-line" class="text-lg" />
          </span>
          <input v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="請輸入密碼"
            autocomplete="new-password"
            class="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
          <button type="button" @click="showPassword = !showPassword"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <Icon :icon="showPassword ? 'mingcute:eye-close-line' : 'mingcute:eye-line'" class="text-lg" />
          </button>
        </div>

        <!-- 密碼強度 -->
        <div v-if="form.password" class="space-y-1">
          <div class="flex gap-1">
            <div v-for="i in 4" :key="i" class="h-1 flex-1 rounded-full transition-colors duration-300"
              :class="i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'" />
          </div>
          <p class="text-xs" :class="{
            'text-red-400': passwordStrength.score === 1,
            'text-orange-400': passwordStrength.score === 2,
            'text-yellow-500': passwordStrength.score === 3,
            'text-mygreen': passwordStrength.score === 4,
          }">密碼強度：{{ passwordStrength.label }}</p>
        </div>
      </div>

      <!-- 確認密碼 -->
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:lock-2-line" class="text-lg" />
        </span>
        <input v-model="form.confirmPassword" :type="showConfirm ? 'text' : 'password'" placeholder="請再次輸入密碼"
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
        {{ loading ? '處理中...' : '創建' }}
      </button>
    </form>

    <div class="flex items-center gap-2 mt-5">
      <div class="flex-1 h-px bg-gray-200" />
      <span class="text-xs text-gray-400">or</span>
      <div class="flex-1 h-px bg-gray-200" />
    </div>

    <div class="mt-3 text-center">
      <button @click="router.push('/login')" class="text-sm text-mygreen hover:underline font-medium">
        登入
      </button>
    </div>
  </AuthCard>
</template>
