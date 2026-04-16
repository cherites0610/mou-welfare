<script setup lang="ts">
import { forgotPassword } from '@/api/user'
import AuthCard from '@/components/auth/AuthCard.vue'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')
const email = ref('')

const handleSubmit = async () => {
  if (!email.value) {
    errorMsg.value = '請輸入信箱'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    await forgotPassword(email.value)
    sessionStorage.setItem('mou_auth_state', JSON.stringify({
      flow: 'forgot-password',
      email: email.value,
    }))
    router.push('/verify')
  } catch (err: any) {
    errorMsg.value = err.message || '發送失敗，請確認信箱是否正確'
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
      <h2 class="text-xl font-bold text-gray-800">忘記密碼</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <p class="text-sm text-gray-500">請輸入您的帳號信箱，我們將寄送驗證碼供您重設密碼。</p>

      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Icon icon="mingcute:mail-line" class="text-lg" />
        </span>
        <input v-model="email" type="email" placeholder="請輸入信箱"
          class="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-mygreen transition-colors" />
      </div>

      <p v-if="errorMsg" class="text-red-500 text-xs text-center">{{ errorMsg }}</p>

      <button type="submit" :disabled="loading"
        class="w-full py-3 bg-mygreen hover:bg-[#7dab00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-colors">
        {{ loading ? '發送中...' : '發送驗證碼' }}
      </button>
    </form>

    <div class="mt-4 text-center">
      <button @click="router.push('/login')" class="text-sm text-mygreen hover:underline">
        返回登入
      </button>
    </div>
  </AuthCard>
</template>
