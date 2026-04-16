import { useChatStore } from '@/stores/chat'
import { useFamilyStore } from '@/stores/family'
import { useUserStore } from '@/stores/user'
import { useWelfareStore } from '@/stores/welfare'

let familyPollingTimer: ReturnType<typeof setInterval> | null = null

export const useAppInit = () => {
  const userStore = useUserStore()
  const familyStore = useFamilyStore()
  const chatStore = useChatStore()
  const welfareStore = useWelfareStore()

  const initAppData = async () => {
    await Promise.all([familyStore.loadFamilies(), chatStore.loadSessions()])
  }

  const clearAppData = () => {
    userStore.clearState()
    familyStore.clearState()
    chatStore.clearState()
    welfareStore.clearState()
  }

  const startFamilyPolling = () => {
    if (familyPollingTimer !== null) return
    familyPollingTimer = setInterval(() => {
      familyStore.loadFamilies()
    }, 5000)
  }

  const stopFamilyPolling = () => {
    if (familyPollingTimer === null) return
    clearInterval(familyPollingTimer)
    familyPollingTimer = null
  }

  return { initAppData, clearAppData, startFamilyPolling, stopFamilyPolling }
}
