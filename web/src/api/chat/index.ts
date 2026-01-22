import request from '@/utils/request'
import type { ChatMessage, ChatResponse, ChatSession, SendMessageDto } from './model'

enum Api {
  Chat = '/chat',
  Session = '/chat/sessions'
}

export const sendMessage = (data: SendMessageDto) => {
  return request.post<ChatResponse>(Api.Chat, data)
}

export const getSessions = () => {
  return request.get<ChatSession[]>(Api.Chat)
}

export const getSessionMessages = (sessionId: string) => {
  return request.get<ChatMessage[]>(`${Api.Session}/${sessionId}/messages`)
}

export const deleteSession = (sessionId: string) => {
  return request.delete<void>(`${Api.Session}/${sessionId}`)
}
