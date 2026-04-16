<script setup lang="ts">
import { useAppInit } from '@/composables/useAppInit'
import { useSession } from '@/composables/useSession'
import { useUserStore } from '@/stores/user'
import { getLiffIdToken, getLiffProfile, isLiffEnvironment, isLiffLoggedIn, liffLogin } from '@/utils/liff'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const { clearSession } = useSession()
const { initAppData, startFamilyPolling, stopFamilyPolling } = useAppInit()

const safeInitAppData = async () => {
  if (!userStore.token) return

  try {
    await initAppData()
    startFamilyPolling()
  } catch (error: any) {
    if (error.response?.status === 401) {
      handleLogout()
    }
  }
}

const handleLogout = () => {
  stopFamilyPolling()
  clearSession()
}

onMounted(async () => {
  if (import.meta.env.VITE_LIFF_ID && isLiffEnvironment()) {
    if (!isLiffLoggedIn()) {
      liffLogin()
      return
    }
    try {
      console.log(getLiffIdToken())
      console.log(getLiffProfile())


      const result = await userStore.userLoginWithLiff(getLiffIdToken())
      if (result.action === 'LOGIN') {
        await initAppData()
        startFamilyPolling()
        router.replace({ name: 'WelfareList' })
      } else {
        router.replace({ name: 'Register', query: { oauthCode: result.oauthCode, email: result.email } })
      }
    } catch {
      router.replace({ name: 'Login' })
    }
    return
  }

  safeInitAppData()
})
</script>

<template>
  <RouterView />
</template>
