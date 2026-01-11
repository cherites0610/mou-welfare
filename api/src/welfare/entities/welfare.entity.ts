import { ApiProperty } from '@nestjs/swagger'
import { Column, CreateDateColumn, Entity, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { User } from '../../user/entities/user.entity.js'

@Entity({ name: 'welfares' })
export class Welfare {
  @ApiProperty({ description: 'ID', example: 1 })
  @PrimaryGeneratedColumn()
  id: number

  @ApiProperty({ description: '補助名稱', example: '青年創業補助計畫' })
  @Column({ name: 'name' })
  name: string

  @ApiProperty({ description: '來源縣市', example: '台北市' })
  @Column({ name: 'source_city' })
  sourceCity: string

  @ApiProperty({ description: '來源連結', example: 'https://example.gov.tw/news/123' })
  @Column({ name: 'source_url', length: 2048 })
  sourceUrl: string

  @ApiProperty({ description: '福利種類', type: [String], example: ['創業補助', '租金補貼'] })
  @Column('simple-array', { name: 'categories' })
  categories: string[]

  @ApiProperty({ description: '申請條件', type: [String], example: ['設籍滿一年', '年滿20歲'] })
  @Column('simple-array', { name: 'requirements' })
  requirements: string[]

  @ApiProperty({ description: '適用身份', type: [String], example: ['學生', '失業勞工'] })
  @Column('simple-array', { name: 'identity' })
  identity: string[]

  @ApiProperty({ description: '可獲得之獎勵', type: [String], example: ['最高補助 50 萬元', '每月 3000 元津貼'] })
  @Column('simple-array', { name: 'rewards' })
  rewards: string[]

  @ApiProperty({ description: '原始內文 HTML', example: '<div><p>公告內容...</p></div>' })
  @Column({ type: 'text', name: 'original_content' })
  originalContent: string

  @ApiProperty({ description: 'AI 總結內文', example: '本計畫提供最高 50 萬元創業補助...' })
  @Column({ type: 'text', name: 'summary_content' })
  summaryContent: string

  @ApiProperty({ description: '發布日期', example: '2023-10-01T10:00:00Z' })
  @Column({ type: 'timestamp', name: 'publish_date' })
  publishDate: Date

  @ApiProperty({ description: '截止日期', required: false, nullable: true, example: '2023-12-31T23:59:59Z' })
  @Column({ type: 'timestamp', name: 'deadline', nullable: true })
  deadline: Date | null

  @ApiProperty({ description: '收藏此福利的用戶', type: () => [User] })
  @ManyToMany(() => User, (user) => user.favoriteWelfares)
  favoritedByUsers: User[]

  @ApiProperty({ description: '建立時間' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ApiProperty({ description: '最後更新時間' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
