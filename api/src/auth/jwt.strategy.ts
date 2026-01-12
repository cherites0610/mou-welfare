import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UsersService } from '../user/users.service.js'
import { JwtPayload } from './interfaces/jwt-payload.interface.js'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || "secret",
    })
  }

  async validate(payload: JwtPayload) {
    this.logger.verbose(`解析 JWT Payload: ${JSON.stringify(payload)}`)

    const user = await this.usersService.findOneByEmailWithPassword(payload.email)

    if (!user) {
      this.logger.warn(`JWT 驗證失敗：找不到用戶 ${payload.email}`)
      throw new UnauthorizedException()
    }

    return user
  }
}
