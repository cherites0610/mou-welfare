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

export interface RagSource {
  id: string
  title: string
  sourceCity: string
  uri: string
  categories: string[]
  requirements: string[]
  identity: string[]
  rewards: string[]
  originalName: string
  originalContent: string
  summaryContent: string
  publishDate: Date | null
  deadline: Date | null
  userMatch: any | null
  familyMatches: any[]
}

export type WelfareCategory =
  | '兒童及青少年福利'
  | '婦女與幼兒福利'
  | '老人福利'
  | '社會救助福利'
  | '身心障礙福利'
  | '其他福利'

export interface MessageMetadata {
  extractedCity?: string
  extractedIdentities?: string[]
  extractedCategory?: WelfareCategory | null
  isConverged?: boolean
  ragSources?: RagSource[] // 引用來源
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
