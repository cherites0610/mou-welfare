import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express' // 需要安裝 @types/express
import { ForgotPasswordDto } from '../user/dtos/forgot-password.dto.js'
import { RegisterDto } from '../user/dtos/register.dto.js'
import { ResendVerificationDto } from '../user/dtos/resend-verification.dto.js'
import { ResetPasswordDto } from '../user/dtos/reset-password.dto.js'
import { AuthService } from './auth.service.js'
import { LoginDto } from './dtos/login.dto.js'
import { LiffLoginDto } from './dtos/liff-login.dto.js'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) { }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '一般用戶登入 (Email/Password)' })
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`接收到登入請求: ${loginDto.email}`)
    return this.authService.login(loginDto)
  }

  @Post('liff-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LIFF 登入 (驗證 AccessToken 並換取內部 Code)' })
  async loginWithLiff(@Body() dto: LiffLoginDto) {
    this.logger.log(`收到 LIFF 登入請求`)
    return this.authService.handleLiffLogin(dto.accessToken)
  }

  @Post('login-oauth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth Code 換取 Token (已註冊用戶)' })
  @ApiBody({ schema: { properties: { code: { type: 'string', example: 'oauth-code-123' } } } })
  async loginWithOAuth(@Body('code') code: string) {
    this.logger.log(`接收到 OAuth Code 登入請求`)
    return this.authService.loginWithOAuthCode(code)
  }

  @Post('register')
  @ApiOperation({ summary: '註冊帳號 (支援一般註冊與 OAuth 註冊)' })
  async register(@Body() registerDto: RegisterDto) {
    this.logger.log(`收到註冊請求: ${registerDto.email}`)
    return this.authService.register(registerDto)
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新發送驗證碼信' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    this.logger.log(`收到重發驗證碼請求: ${dto.email}`)
    return this.authService.resendVerificationCode(dto)
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘記密碼 (發送驗證碼)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.logger.log(`收到忘記密碼請求 Email: ${dto.email}`)
    return this.authService.forgotPassword(dto)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重設密碼 (驗證碼+新密碼)' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    this.logger.log(`收到重設密碼請求 Email: ${dto.email}`)
    return this.authService.resetPassword(dto)
  }

  // --- OAuth 相關 ---

  @Get('line-login')
  @ApiOperation({ summary: '取得 Line OAuth 登入連結' })
  getLineLoginLink(): { url: string } {
    const clientId = this.configService.getOrThrow<string>('LINE_LOGIN_CLIENT_ID')
    const backendUrl = this.configService.getOrThrow<string>('BACKEND_URL')
    // 注意：這裡的回調地址可能需要根據前端路由調整，或是保持指向後端
    const redirectUri = encodeURIComponent(`${backendUrl}/auth/line-callback`)
    const state = crypto.randomUUID()

    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid%20email`

    this.logger.log(`產生 Line OAuth 登入連結: ${url}`)
    return { url }
  }

  @Get('line-callback')
  @ApiOperation({ summary: 'Line OAuth 登入回調 (處理後重定向回前端)' })
  async handleLineCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    this.logger.log(`收到 Line OAuth 回調，Code: ${code}`)

    const { code: oauthCode, action } = await this.authService.handleLineLoginCallback(code, state)

    // 重定向回前端頁面，帶上 oauthCode 與 action
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL')
    const redirectUrl = `${frontendUrl}/auth/callback?code=${oauthCode}&action=${action}`

    this.logger.log(`重定向回前端: ${redirectUrl}`)
    return res.redirect(redirectUrl)
  }

  // --- Google OAuth ---

  @Get('google-login')
  @ApiOperation({ summary: '取得 Google OAuth 登入連結' })
  getGoogleLoginLink(): { url: string } {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID')
    const backendUrl = this.configService.getOrThrow<string>('BACKEND_URL')
    const redirectUri = encodeURIComponent(`${backendUrl}/auth/google-callback`)

    const scope = encodeURIComponent('email profile')

    const url = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`

    return { url }
  }

  @Get('google-callback')
  @ApiOperation({ summary: 'Google OAuth 登入回調' })
  async handleGoogleCallback(
    @Query('code') code: string,
    @Res() res: Response
  ) {
    this.logger.log(`收到 Google OAuth 回調`)
    const { code: oauthCode, action } = await this.authService.handleGoogleLoginCallback(code)

    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL')
    const redirectUrl = `${frontendUrl}/auth/callback?code=${oauthCode}&action=${action}`

    return res.redirect(redirectUrl)
  }
}
