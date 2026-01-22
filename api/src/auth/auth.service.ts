import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { Redis } from 'ioredis'
import { NotificationsService } from '../notification/notifications.service.js'
import { TemplateName } from '../notification/templates/notification-templates.js'
import { REDIS_CLIENT } from '../redis/redis.module.js'
import { ForgotPasswordDto } from '../user/dtos/forgot-password.dto.js'
import { RegisterDto } from '../user/dtos/register.dto.js'
import { ResendVerificationDto } from '../user/dtos/resend-verification.dto.js'
import { ResetPasswordDto } from '../user/dtos/reset-password.dto.js'
import { User } from '../user/entities/user.entity.js'
import { UsersService } from '../user/users.service.js'
import { LoginDto } from './dtos/login.dto.js'
import { JwtPayload } from './interfaces/jwt-payload.interface.js'

export interface OAuthRedisPayload {
  email: string
  action: 'LOGIN' | 'REGISTER'
  providerData?: any
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT)
    private readonly cacheManager: Redis,
  ) { }

  // --- 基礎登入與 Token ---

  async validateUser(email: string, pass: string): Promise<User> {
    const user = await this.usersService.findOneByEmailWithPassword(email)
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user
      return result as User
    }
    throw new UnauthorizedException('帳號或密碼錯誤')
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password)
    return this.generateTokenResponse(user)
  }

  private async generateTokenResponse(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email }
    return {
      access_token: await this.jwtService.signAsync(payload),
      user,
    }
  }

  // --- 註冊與驗證流程 ---

  async register(registerDto: RegisterDto): Promise<User> {
    const { email, password, verificationCode, oauthCode, ...otherDetails } = registerDto

    // 1. 驗證來源 (OAuth Code 或 Email Code)
    if (oauthCode) {
      const rawData = await this.cacheManager.get(`oauth:${oauthCode}`)
      if (!rawData) throw new BadRequestException('OAuth代碼無效或已過期')

      const payload: OAuthRedisPayload = JSON.parse(rawData)
      if (payload.email !== email) throw new BadRequestException('Email與第三方登入資訊不符')

      await this.cacheManager.del(`oauth:${oauthCode}`)
    } else {
      const cachedCode = await this.cacheManager.get(`verify:${email}`)
      if (!cachedCode || cachedCode !== verificationCode) throw new BadRequestException('驗證碼無效或已過期')
      await this.cacheManager.del(`verify:${email}`)
    }

    // 2. 密碼加密
    const hashedPassword = await bcrypt.hash(password, 10)

    // 3. 呼叫 UsersService 寫入資料
    return this.usersService.create({
      email,
      password: hashedPassword,
      isVerified: true,
      ...otherDetails,
    })
  }

  async resendVerificationCode(dto: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.usersService.findOneByEmail(dto.email)
    if (user && user.isVerified) {
      throw new BadRequestException('用戶已完成驗證')
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await this.cacheManager.set(`verify:${dto.email}`, code, 'EX', 300)

    await this.notificationsService.sendEmail(
      dto.email,
      TemplateName.REGISTER_VERIFICATION,
      { code }
    )

    return { message: '驗證碼已發送' }
  }

  // --- OAuth 第三方登入邏輯 ---

  async handleLineLoginCallback(code: string, state: string) {
    const clientId = this.configService.getOrThrow<string>('LINE_LOGIN_CLIENT_ID')
    const clientSecret = this.configService.getOrThrow<string>('LINE_LOGIN_CLIENT_SECRET')
    const backendUrl = this.configService.getOrThrow<string>('BACKEND_URL')
    const redirectUri = `${backendUrl}/auth/line-callback`

    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok) {
      this.logger.error(`Line Token 交換失敗: ${JSON.stringify(tokenData)}`)
      throw new BadRequestException('Line 登入失敗')
    }
    const idToken = tokenData.id_token

    const profileResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `${clientSecret}`,
      },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    })

    const profileData = await profileResponse.json()
    if (!profileResponse.ok) {
      this.logger.error(`Line 驗證失敗: ${JSON.stringify(profileData)}`)
      throw new BadRequestException('Line 登入失敗')
    }
    const email = profileData.email

    return this.handleThirdPartyCallback(email, profileData, 'line')
  }

  async handleGoogleLoginCallback(code: string) {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID')
    const clientSecret = this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET')
    const backendUrl = this.configService.getOrThrow<string>('BACKEND_URL')
    const redirectUri = `${backendUrl}/auth/google-callback`

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      this.logger.error(`Google Token Exchange Failed: ${await tokenResponse.text()}`)
      throw new BadRequestException('Google 登入失敗')
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userInfoResponse.ok) throw new BadRequestException('Google 用戶資訊獲取失敗')

    const profileData = await userInfoResponse.json()
    const email = profileData.email

    return this.handleThirdPartyCallback(email, { ...profileData, id: profileData.sub }, 'google')
  }

  async handleThirdPartyCallback(email: string, providerData: any, source: string) {
    const user = await this.usersService.findOneByEmail(email)
    const code = crypto.randomUUID()
    const action = user ? 'LOGIN' : 'REGISTER'

    const payload: OAuthRedisPayload = {
      email,
      action,
      providerData: { ...providerData, source },
    }

    await this.cacheManager.set(`oauth:${code}`, JSON.stringify(payload), 'EX', 300)
    return { code, action }
  }

  async loginWithOAuthCode(code: string) {
    const rawData = await this.cacheManager.get(`oauth:${code}`)
    if (!rawData) throw new BadRequestException('OAuth代碼無效或已過期')

    const payload: OAuthRedisPayload = JSON.parse(rawData)
    if (payload.action !== 'LOGIN') throw new BadRequestException('此代碼僅供註冊使用')

    const user = await this.usersService.findOneByEmail(payload.email)
    if (!user) throw new NotFoundException('用戶不存在')

    if (payload.providerData.source === 'line' && payload.providerData.id !== user.lineId) {
      await this.usersService.update(user.id, { lineId: payload.providerData.id })
      user.lineId = payload.providerData.id
    }

    if (payload.providerData.source === 'google' && payload.providerData.id !== user.googleId) {
      await this.usersService.update(user.id, { googleId: payload.providerData.id })
      user.googleId = payload.providerData.id
    }

    await this.cacheManager.del(`oauth:${code}`)

    return this.generateTokenResponse(user)
  }

  // --- 密碼重設流程 ---

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findOneByEmail(dto.email)
    if (!user) throw new NotFoundException('找不到該電子信箱註冊的用戶')

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await this.cacheManager.set(`reset_pwd:${dto.email}`, code, 'EX', 600)

    await this.notificationsService.sendEmail(
      dto.email,
      TemplateName.RESET_PASSWORD,
      { code }
    )
    return { message: '重設密碼驗證信已發送' }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const cachedCode = await this.cacheManager.get(`reset_pwd:${dto.email}`)
    if (!cachedCode || cachedCode !== dto.verificationCode) {
      throw new BadRequestException('驗證碼錯誤或已過期')
    }

    const user = await this.usersService.findOneByEmail(dto.email)
    if (!user) throw new NotFoundException('用戶不存在')

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10)
    await this.usersService.update(user.id, { password: hashedPassword })

    await this.cacheManager.del(`reset_pwd:${dto.email}`)
    return { message: '密碼重設成功' }
  }
}
