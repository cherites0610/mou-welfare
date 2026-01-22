import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class SearchWelfareDto {
  @ApiProperty({ description: '關鍵字搜尋', required: false })
  @IsOptional()
  @IsString()
  keywords?: string

  @ApiProperty({ description: '來源縣市', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[]

  @ApiProperty({ description: '福利種類', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[]

  @ApiProperty({ description: '當前用戶 ID (若已登入)', required: false })
  @IsOptional()
  @IsUUID()
  userId?: string

  @ApiProperty({ description: '手動輸入身份 (模擬試算用)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  identities?: string[]

  @ApiProperty({ description: '家庭 ID (若要查看全家)', required: false })
  @IsOptional()
  @IsUUID()
  familyId?: string

  @ApiProperty({ description: '頁碼', default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiProperty({ description: '每頁筆數', default: 10 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  limit: number = 10
}
