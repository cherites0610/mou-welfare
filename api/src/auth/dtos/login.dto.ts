import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ description: '電子信箱', example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ description: '密碼', example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string
}
