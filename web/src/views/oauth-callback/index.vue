<script setup lang="ts">
import AuthCard from '@/components/auth/AuthCard.vue'
import { useAppInit } from '@/composables/useAppInit'
import { useUserStore } from '@/stores/user'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

const userStore = useUserStore()
const { initAppData, clearAppData, startFamilyPolling } = useAppInit()

const errorMsg = ref('')

onMounted(async () => {
  const code = route.query.code as string | undefined
  const action = route.query.action as string | undefined
  const email = route.query.email as string | undefined

  if (!code || !action) {
    router.replace('/login')
    return
  }

  if (action === 'LOGIN') {
    clearAppData()
    try {
      await userStore.userLoginWithOAuth(code)
      await initAppData()
      startFamilyPolling()
      router.replace('/welfares')
    } catch (err: any) {
      clearAppData()
      errorMsg.value = err.message || 'OAuth 登入失敗，請稍後再試'
    }
  } else if (action === 'REGISTER') {
    router.replace({ path: '/register', query: { oauthCode: code, ...(email && { email }) } })
  } else {
    router.replace('/login')
  }
})
</script>

<template>
  <AuthCard>
    <div class="flex-1 flex flex-col items-center justify-center">
      <div v-if="!errorMsg" class="flex flex-col items-center gap-4">
        <div class="w-10 h-10 border-4 border-mygreen border-t-transparent rounded-full animate-spin" />
        <p class="text-sm text-gray-500">處理中，請稍候...</p>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <p class="text-red-500 text-sm text-center">{{ errorMsg }}</p>
        <button
          class="px-6 py-2 bg-mygreen hover:bg-[#7dab00] text-white text-sm font-medium rounded-full transition-colors"
          @click="router.replace('/login')"
        >
          返回登入
        </button>
      </div>
    </div>
  </AuthCard>
</template>
