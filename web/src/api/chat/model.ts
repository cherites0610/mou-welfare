export type MessageRole = 'user' | 'assistant' | 'system'

export interface RagSource {
  id: string
  title: string
  uri: string
  snippet: string
}

export interface MessageMetadata {
  extractedCity?: string
  extractedIdentities?: string[]
  ragSources?: RagSource[]
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
}

export interface ChatResponse {
  sessionId: string
  reply: string
  metadata: MessageMetadata
}
