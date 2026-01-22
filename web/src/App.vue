<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import { useFamilyStore } from '@/stores/family'
import { useUserStore } from '@/stores/user'
import { useWelfareStore } from '@/stores/welfare'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const userStore = useUserStore()
const familyStore = useFamilyStore()
const chatStore = useChatStore()
const welfareStore = useWelfareStore()

const initAppData = async () => {
  if (!userStore.token) return

  try {
    await Promise.all([
      familyStore.loadFamilies(),
      // chatStore.loadSessions()
    ])
  } catch (error: any) {
    if (error.response?.status === 401) {
      handleLogout()
    }
  }
}

const handleLogout = () => {
  userStore.clearState()
  familyStore.clearState()
  chatStore.clearState()
  welfareStore.clearState()
  router.push('/login')
}

onMounted(() => {
  initAppData()
})
</script>

<template>
  <RouterView />
</template>
