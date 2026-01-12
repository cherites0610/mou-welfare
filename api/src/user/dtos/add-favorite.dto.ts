import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsUUID } from 'class-validator'

export class AddFavoriteDto {
  @ApiProperty({ description: '福利 ID', example: 1 })
  @IsNotEmpty()
  @IsUUID()
  welfareId: string
}
