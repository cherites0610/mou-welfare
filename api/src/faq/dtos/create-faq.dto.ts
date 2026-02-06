import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsString } from 'class-validator'

export class CreateFaqDto {
  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  order_index: number

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  answer: string
}
