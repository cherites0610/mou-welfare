import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ChatMessage } from './chat-message.entity.js'

@Entity({ name: 'chat_sessions' })
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', nullable: true, type: 'uuid' })
  userId: string

  @Column({ nullable: true })
  title: string

  @Column({ name: 'auto_apply_profile', default: true })
  autoApplyProfile: boolean

  @Column({ name: 'generate_markdown', default: true })
  generateMarkdown: boolean

  @OneToMany(() => ChatMessage, (message) => message.session)
  messages: ChatMessage[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
