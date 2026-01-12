import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator'

export class ResetPasswordDto {
  @ApiProperty({ description: '電子信箱', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string

  @ApiProperty({ description: '驗證碼', example: '123456' })
  @IsString()
  @Length(6, 6, { message: '驗證碼必須為6位數' })
  verificationCode: string

  @ApiProperty({ description: '新密碼 (至少8碼)', example: 'NewStrongPass1!' })
  @IsString()
  @MinLength(8, { message: '密碼長度至少需要8個字元' })
  newPassword: string
}
