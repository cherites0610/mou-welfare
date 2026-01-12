import { ApiProperty } from '@nestjs/swagger'
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum NotificationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum NotificationType {
  EMAIL = 'EMAIL',
  LINE = 'LINE',
}

@Entity({ name: 'notification_logs' })
export class NotificationLog {
  @ApiProperty({ description: 'ID' })
  @PrimaryGeneratedColumn()
  id: number

  @ApiProperty({ description: '發送目標（Email 或 Line ID）' })
  @Column()
  target: string

  @ApiProperty({ description: '通知類型', enum: NotificationType })
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType

  @ApiProperty({ description: '狀態', enum: NotificationStatus })
  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus

  @ApiProperty({ description: '標題', nullable: true })
  @Column({ nullable: true })
  title: string

  @ApiProperty({ description: '內容', nullable: true })
  @Column({ type: 'text', nullable: true })
  content: string

  @ApiProperty({ description: '錯誤訊息', nullable: true })
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string

  @ApiProperty({ description: '建立時間' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ApiProperty({ description: '更新時間' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
