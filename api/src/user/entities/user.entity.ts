import { ApiProperty } from '@nestjs/swagger'
import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { UserFamily } from '../../user-family/entities/user-family.entity.js'
import { Welfare } from '../../welfare/entities/welfare.entity.js'

@Entity({ name: 'users' })
export class User {
  @ApiProperty({ description: 'uuid', example: 1 })
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ApiProperty({ description: '電子信箱', example: 'user@example.com' })
  @Column({ unique: true })
  email: string

  @ApiProperty({ description: '名稱', example: 'John Doe' })
  @Column({ name: 'name', type: 'varchar', nullable: true })
  name: string

  @ApiProperty({ description: '哈希過的密碼', required: false })
  @Column({ name: 'password', select: false, nullable: true })
  password: string

  @ApiProperty({ description: '生日', example: '1995-01-01', required: false, nullable: true })
  @Column({ type: 'date', nullable: true })
  birthday: Date | null

  @ApiProperty({ description: '性別', example: 'Male', required: false, nullable: true })
  @Column({ nullable: true })
  gender: string

  @ApiProperty({ description: '帳號是否驗證', example: false })
  @Column({ name: 'is_verified', default: false })
  isVerified: boolean

  @ApiProperty({ description: '是否訂閱電子報', example: false })
  @Column({ name: 'is_subscribed', default: false })
  isSubscribed: boolean

  @ApiProperty({ description: 'Line ID', required: false, nullable: true })
  @Column({ name: 'line_id', type: 'varchar', nullable: true, unique: true })
  lineId: string | null

  @ApiProperty({ description: 'Google ID', required: false, nullable: true })
  @Column({ name: 'google_id', type: 'varchar', nullable: true, unique: true })
  googleId: string | null

  @ApiProperty({ description: '頭像 URL', example: 'https://example.com/avatar.jpg', required: false, nullable: true })
  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl: string | null

  @ApiProperty({ description: '地址', example: '台北市信義區...', required: false, nullable: true })
  @Column({ nullable: true, type: 'varchar' })
  address: string | null

  @ApiProperty({ description: '身份類別', type: [String], example: ['student', 'entrepreneur'] })
  @Column('simple-array', { name: 'identities', nullable: true })
  identities: string[]

  @ApiProperty({ description: '收藏的福利', type: () => [Welfare] })
  @ManyToMany(() => Welfare, (welfare) => welfare.favoritedByUsers)
  @JoinTable({
    name: 'user_favorite_subsidies',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'subsidy_id',
      referencedColumnName: 'id',
    },
  })
  favoriteWelfares: Welfare[]

  @ApiProperty({ description: '所屬家庭與身份', type: () => [UserFamily] })
  @OneToMany(() => UserFamily, (userFamily) => userFamily.user)
  userFamilies: UserFamily[]

  @ApiProperty({ description: '建立時間' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ApiProperty({ description: '最後更新時間' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
