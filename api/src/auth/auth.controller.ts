import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service.js'
import { LoginDto } from './dtos/login.dto.js'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用戶登入' })
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`接收到登入請求: ${loginDto.email}`)
    return this.authService.login(loginDto)
  }
}
