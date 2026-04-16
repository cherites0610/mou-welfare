import router from '@/router'
import { useChatStore } from '@/stores/chat'
import { useFamilyStore } from '@/stores/family'
import { useUserStore } from '@/stores/user'
import { useWelfareStore } from '@/stores/welfare'

export const useSession = () => {
  const clearSession = () => {
    useUserStore().clearState()
    useFamilyStore().clearState()
    useChatStore().clearState()
    useWelfareStore().clearState()
    router.replace({ name: 'Login' })
  }

  return { clearSession }
}
