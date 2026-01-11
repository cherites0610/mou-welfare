import { ApiProperty } from '@nestjs/swagger'
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { Family } from '../../family/entities/family.entity.js'
import { User } from '../../user/entities/user.entity.js'

@Entity({ name: 'user_families' })
export class UserFamily {
  @ApiProperty({ description: 'ID', example: 1 })
  @PrimaryGeneratedColumn()
  id: number

  @ApiProperty({ description: '用戶在家庭中的身份', example: 'Father' })
  @Column({ name: 'role' })
  role: string

  @ApiProperty({ description: '用戶 ID', example: 1 })
  @Column({ name: 'user_id' })
  userId: number

  @ApiProperty({ description: '家庭 ID', example: 1 })
  @Column({ name: 'family_id' })
  familyId: number

  // 設定與 User 的關聯
  @ManyToOne(() => User, (user) => user.userFamilies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) // 指定外鍵名稱為 snake_case
  user: User

  // 設定與 Family 的關聯
  @ManyToOne(() => Family, (family) => family.userFamilies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' }) // 指定外鍵名稱為 snake_case
  family: Family

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
