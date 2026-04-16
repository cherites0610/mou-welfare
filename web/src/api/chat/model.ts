import type { WelfareResponse } from '../welfare/model'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface MessageMetadata {
  extractedCity?: string
  extractedIdentities?: string[]
  extractedCategory: string
  isConverged?: boolean
  ragSources?: WelfareResponse[]
  processingTime?: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  metadata?: MessageMetadata
  createdAt: string
}

export interface ChatSession {
  id: string
  userId: string
  title: string
  messages?: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface SendMessageDto {
  sessionId?: string
  message: string
  familyId?: string
  userId?: string
  autoApplyProfile?: boolean
}

export interface ChatResponse {
  sessionId: string
  reply: string
  metadata: MessageMetadata
}
