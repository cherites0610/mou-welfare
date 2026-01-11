import { ApiProperty } from '@nestjs/swagger'
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { UserFamily } from '../../user-family/entities/user-family.entity.js'

@Entity({ name: 'families' })
export class Family {
  @ApiProperty({ description: 'ID', example: 1 })
  @PrimaryGeneratedColumn()
  id: number

  @ApiProperty({ description: '家庭名稱', example: '陳家大宅' })
  @Column({ name: 'name' })
  name: string

  // 關聯到中間表
  @ApiProperty({ description: '家庭成員關聯', type: () => [UserFamily] })
  @OneToMany(() => UserFamily, (userFamily) => userFamily.family)
  userFamilies: UserFamily[]

  @ApiProperty({ description: '建立時間' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ApiProperty({ description: '最後更新時間' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
