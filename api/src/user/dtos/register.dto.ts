import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MinLength
} from 'class-validator'

export class RegisterDto {
  @ApiProperty({ description: '電子信箱', example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ description: '密碼 (至少8碼)', example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string

  @ApiProperty({ description: '名稱', example: 'John Doe' })
  @IsString()
  name: string

  @ApiProperty({ description: '信箱驗證碼', example: '123456' })
  @IsString()
  @IsOptional()
  @Length(6, 6)
  verificationCode?: string

  @ApiProperty({ description: 'OAuth Code', required: false })
  @IsOptional()
  @IsString()
  oauthCode?: string


  @ApiProperty({ description: '生日', example: '1995-01-01', required: false })
  @IsOptional()
  @IsDateString()
  birthday?: Date

  @ApiProperty({ description: '性別', example: 'Male', required: false })
  @IsOptional()
  @IsString()
  gender?: string

  @ApiProperty({ description: '是否訂閱電子報', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isSubscribed?: boolean

  @ApiProperty({ description: 'Line ID', required: false })
  @IsOptional()
  @IsString()
  lineId?: string

  @ApiProperty({ description: 'Google ID', required: false })
  @IsOptional()
  @IsString()
  googleId?: string

  @ApiProperty({ description: '頭像 URL', required: false })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string

  @ApiProperty({ description: '地址', required: false })
  @IsOptional()
  @IsString()
  address?: string

  @ApiProperty({ description: '身份類別', example: ['student'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  identities?: string[]
}
