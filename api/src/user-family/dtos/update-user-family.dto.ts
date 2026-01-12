import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class UpdateUserFamilyDto {
  @ApiProperty({ description: '在家庭中的身份', example: 'Mother' })
  @IsString()
  @IsNotEmpty()
  role: string
}
