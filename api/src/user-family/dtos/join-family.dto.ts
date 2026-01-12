import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Length } from 'class-validator'

export class JoinFamilyDto {
  @ApiProperty({ description: '6位數邀請碼', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: '邀請碼必須為6位數' })
  code: string
}
