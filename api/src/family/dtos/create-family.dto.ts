import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Length } from 'class-validator'

export class CreateFamilyDto {
  @ApiProperty({ description: '家庭名稱', example: '陳家大宅' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  name: string
}
