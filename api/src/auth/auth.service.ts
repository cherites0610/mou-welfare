import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { LoginDto } from './dtos/login.dto.js'
import { User } from '../user/entities/user.entity.js'
import { UsersService } from '../user/users.service.js'
import { JwtPayload } from './interfaces/jwt-payload.interface.js'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  async validateUser(email: string, pass: string): Promise<User> {
    this.logger.log(`驗證用戶憑證: ${email}`)
    const user = await this.usersService.findOneByEmailWithPassword(email)

    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user
      return result as User
    }

    this.logger.warn(`驗證失敗: ${email}`)
    throw new UnauthorizedException('驗證失敗')
  }

  async login(loginDto: LoginDto) {
    this.logger.log(`執行登入流程: ${loginDto.email}`)
    const user = await this.validateUser(loginDto.email, loginDto.password)

    const payload: JwtPayload = { sub: user.id, email: user.email }

    this.logger.log(`簽發 JWT Token: User ID ${user.id}`)

    return {
      access_token: await this.jwtService.signAsync(payload),
      user,
    }
  }
}
