import { OmitType, PartialType } from '@nestjs/swagger'
import { RegisterDto } from './register.dto.js'

export class UpdateUserDto extends PartialType(
  OmitType(RegisterDto, ['email', 'password', 'verificationCode'] as const),
) { }
