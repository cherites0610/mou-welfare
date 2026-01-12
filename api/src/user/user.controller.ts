import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { ForgotPasswordDto } from './dtos/forgot-password.dto.js'
import { RegisterDto } from './dtos/register.dto.js'
import { ResendVerificationDto } from './dtos/resend-verification.dto.js'
import { ResetPasswordDto } from './dtos/reset-password.dto.js'
import { UpdateUserDto } from './dtos/update-user.dto.js'
import { User } from './entities/user.entity.js'
import { UsersService } from './users.service.js'

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly usersService: UsersService) { }

  @Post('register')
  @ApiOperation({ summary: '註冊帳號' })
  async register(@Body() registerDto: RegisterDto): Promise<User> {
    this.logger.log(`收到註冊請求: ${registerDto.email}`)
    return this.usersService.register(registerDto)
  }

  @Post('resend-verification')
  @ApiOperation({ summary: '重新發送驗證碼信' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    this.logger.log(`收到重發驗證碼請求: ${dto.email}`)
    return this.usersService.resendVerificationCode(dto)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改用戶資料 (需登入)' })
  async updateProfile(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ): Promise<User> {
    this.logger.log(`收到更新資料請求 Target ID: ${id}, Request User ID: ${user.id}`)

    if (id !== user.id) {
      this.logger.warn(`權限不足：用戶 ${user.id} 嘗試修改用戶 ${id} 的資料`)
      throw new ForbiddenException('你只能修改自己的資料')
    }

    return this.usersService.updateProfile(id, updateUserDto)
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘記密碼 (發送驗證碼)' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    this.logger.log(`收到忘記密碼請求 Email: ${dto.email}`)
    return this.usersService.forgotPassword(dto)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重設密碼 (驗證碼+新密碼)' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    this.logger.log(`收到重設密碼請求 Email: ${dto.email}`)
    return this.usersService.resetPassword(dto)
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取得個人資料' })
  async getProfile(@CurrentUser() user: User) {
    this.logger.log(`收到取得個人資料請求 User ID: ${user.id}`)
    return user
  }

}
