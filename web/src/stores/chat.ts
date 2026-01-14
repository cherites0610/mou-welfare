import {
  deleteSession,
  getSessionMessages,
  getSessions,
  sendMessage
} from '@/api/chat'
import type {
  ChatMessage,
  ChatSession,
  SendMessageDto
} from '@/api/chat/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore(
  'chat',
  () => {
    const sessions = ref<ChatSession[]>([])
    const currentSessionId = ref<string | null>(null)
    const messages = ref<ChatMessage[]>([])
    const loading = ref(false)
    const sending = ref(false)

    const loadSessions = async () => {
      loading.value = true
      try {
        const res = await getSessions()
        sessions.value = res
      } catch (error) {
        return Promise.reject(error)
      } finally {
        loading.value = false
      }
    }

    const switchSession = async (sessionId: string) => {
      if (currentSessionId.value === sessionId && messages.value.length > 0) return

      currentSessionId.value = sessionId
      loading.value = true
      try {
        const msgs = await getSessionMessages(sessionId)
        messages.value = msgs
      } catch (error) {
        return Promise.reject(error)
      } finally {
        loading.value = false
      }
    }

    const initNewSession = () => {
      currentSessionId.value = null
      messages.value = []
    }

    const sendMsg = async (params: Omit<SendMessageDto, 'sessionId'>) => {
      if (!params.message.trim()) return

      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        sessionId: currentSessionId.value || 'temp',
        role: 'user',
        content: params.message,
        createdAt: new Date().toISOString()
      }
      messages.value.push(tempUserMsg)
      sending.value = true

      try {
        const payload: SendMessageDto = {
          ...params,
          sessionId: currentSessionId.value || undefined
        }

        const res = await sendMessage(payload)

        if (!currentSessionId.value) {
          currentSessionId.value = res.sessionId
          await loadSessions()
        }

        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sessionId: res.sessionId,
          role: 'assistant',
          content: res.reply,
          metadata: res.metadata,
          createdAt: new Date().toISOString()
        }
        messages.value.push(aiMsg)

      } catch (error) {
        return Promise.reject(error)
      } finally {
        sending.value = false
      }
    }

    const removeSession = async (sessionId: string) => {
      try {
        await deleteSession(sessionId)
        sessions.value = sessions.value.filter(s => s.id !== sessionId)
        if (currentSessionId.value === sessionId) {
          initNewSession()
        }
      } catch (error) {
        return Promise.reject(error)
      }
    }

    const clearState = () => {
      sessions.value = []
      messages.value = []
      currentSessionId.value = null
    }

    return {
      sessions,
      currentSessionId,
      messages,
      loading,
      sending,
      loadSessions,
      switchSession,
      initNewSession,
      sendMsg,
      removeSession,
      clearState
    }
  },
  {
    persist: {
      pick: ['sessions', 'currentSessionId'],
      storage: localStorage
    }
  }
)
