import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class SendMessageDto {
  @ApiProperty({ required: false, description: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ required: true, description: '用戶最新問題' })
  message: string
}
