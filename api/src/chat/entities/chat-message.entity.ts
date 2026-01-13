import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { ChatSession } from './chat-session.entity.js'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface MessageMetadata {
  extractedCity?: string
  extractedIdentities?: string[]
  ragSources?: { id: string, title: string; uri: string; snippet: string }[] // 引用來源
  processingTime?: number
}

@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'session_id' })
  sessionId: string

  @Column({ type: 'enum', enum: ['user', 'assistant', 'system'] })
  role: MessageRole

  @Column({ type: 'text' })
  content: string

  @Column({ type: 'json', nullable: true })
  metadata: MessageMetadata

  @ManyToOne(() => ChatSession, (session) => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
