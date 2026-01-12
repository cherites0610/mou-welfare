import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class CreateUserFamilyDto {
  @ApiProperty({ description: '家庭 ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  familyId: string

  @ApiProperty({ description: '用戶 ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  userId: string

  @ApiProperty({ description: '在家庭中的身份', example: 'Father' })
  @IsString()
  @IsNotEmpty()
  role: string
}
