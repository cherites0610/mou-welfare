import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('faq')
export class Faq {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ApiProperty()
  @Column({ name: 'order_index', type: 'int' })
  order_index: number

  @ApiProperty()
  @Column({ name: 'question', type: 'varchar' })
  question: string

  @ApiProperty()
  @Column({ name: 'answer', type: 'text' })
  answer: string
}
