import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class DeleteAccountDto {
  @ApiProperty({ example: 'password123', description: '確認刪除用的密碼' })
  @IsString()
  @IsNotEmpty()
  password: string
}
