import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class SendMessageDto {
  @ApiProperty({ required: false, description: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ required: true, description: '用戶最新問題' })
  message: string

  @ApiProperty({ required: false, description: '家庭 uuid' })
  @IsOptional()
  @IsUUID()
  familyId: string

  @ApiProperty({ required: false, description: '用戶 uuid' })
  @IsOptional()
  @IsUUID()
  userId: string

  @ApiProperty({
    required: false,
    default: true,
    description: '是否自動套用個人資料（僅建立新 session 時有效，預設 true）',
  })
  @IsOptional()
  @IsBoolean()
  autoApplyProfile?: boolean

  @ApiProperty({
    required: false,
    default: true,
    description: '是否以 Markdown 格式回覆（僅建立新 session 時有效，預設 true）',
  })
  @IsOptional()
  @IsBoolean()
  generateMarkdown?: boolean
}
