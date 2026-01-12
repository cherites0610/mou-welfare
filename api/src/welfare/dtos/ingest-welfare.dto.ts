import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator'

export class IngestWelfareDto {
  @ApiProperty({ description: '來源縣市', example: '台北市' })
  @IsString()
  @IsNotEmpty()
  sourceCity: string

  @ApiProperty({ description: '來源連結', example: 'https://example.gov.tw/news/123' })
  @IsUrl()
  @IsNotEmpty()
  sourceUrl: string

  @ApiProperty({ description: '補助名稱', example: '青年創業補助計畫' })
  @IsString()
  @IsNotEmpty()
  originalName: string

  @ApiProperty({ description: '發布日期', example: '2023-10-01' })
  @IsDateString()
  @IsOptional()
  publishDate: string | null

  @ApiProperty({ description: '原始內文 HTML' })
  @IsString()
  @IsNotEmpty()
  originalContent: string
}
