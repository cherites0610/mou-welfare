import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcrypt'
import { Redis } from 'ioredis'
import { Repository } from 'typeorm'
import { NotificationsService } from '../notification/notifications.service.js'
import { TemplateName } from '../notification/templates/notification-templates.js'
import { REDIS_CLIENT } from '../redis/redis.module.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { ForgotPasswordDto } from './dtos/forgot-password.dto.js'
import { RegisterDto } from './dtos/register.dto.js'
import { ResendVerificationDto } from './dtos/resend-verification.dto.js'
import { ResetPasswordDto } from './dtos/reset-password.dto.js'
import { UpdateUserDto } from './dtos/update-user.dto.js'
import { User } from './entities/user.entity.js'

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Welfare)
    private readonly welfareRepository: Repository<Welfare>,
    @Inject(REDIS_CLIENT)
    private readonly cacheManager: Redis,
    private readonly notificationsService: NotificationsService
  ) { }

  async register(registerDto: RegisterDto): Promise<User> {
    const { email, password, verificationCode, ...otherDetails } = registerDto
    this.logger.log(`開始註冊流程，Email: ${email}`)

    const existingUser = await this.usersRepository.findOne({ where: { email } })
    if (existingUser) {
      this.logger.warn(`註冊失敗：Email 已存在 - ${email}`)
      throw new ConflictException('Email已經存在')
    }

    const cachedCode = await this.cacheManager.get(`verify:${email}`)
    if (!cachedCode || cachedCode !== verificationCode) {
      this.logger.warn(`註冊失敗：驗證碼無效或已過期 - ${email}`)
      throw new BadRequestException('驗證碼無效或已過期')
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const newUser = this.usersRepository.create({
      email,
      password: hashedPassword,
      isVerified: true,
      ...otherDetails,
    })

    const savedUser = await this.usersRepository.save(newUser)
    await this.cacheManager.del(`verify:${email}`)

    this.logger.log(`用戶註冊成功：ID ${savedUser.id}, Email ${savedUser.email}`)

    return savedUser
  }

  async resendVerificationCode(dto: ResendVerificationDto): Promise<{ message: string }> {
    const { email } = dto
    this.logger.log(`請求重新發送驗證碼，Email: ${email}`)

    const user = await this.usersRepository.findOne({ where: { email } })
    if (user && user.isVerified) {
      this.logger.warn(`發送失敗：用戶已完成驗證 - ${email}`)
      throw new BadRequestException('用戶已完成驗證')
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await this.cacheManager.set(`verify:${email}`, code, 'EX', 300000)

    await this.notificationsService.sendEmail(
      email,
      TemplateName.REGISTER_VERIFICATION,
      { code }
    )
    this.logger.log(`驗證碼已生成並發送至: ${email}`)

    return { message: '驗證碼已發送' }
  }

  async updateProfile(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`嘗試更新用戶資料，ID: ${id}`)

    const user = await this.usersRepository.findOne({ where: { id } })
    if (!user) {
      this.logger.error(`更新失敗：找不到用戶 ID ${id}`)
      throw new NotFoundException('找不到用戶')
    }

    Object.assign(user, updateUserDto)

    const updatedUser = await this.usersRepository.save(user)
    this.logger.log(`用戶資料更新完成，ID: ${id}`)

    return updatedUser
  }

  async findOneByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne()
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = dto
    this.logger.log(`收到忘記密碼請求: ${email}`)

    const user = await this.usersRepository.findOne({ where: { email } })
    if (!user) {
      this.logger.warn(`忘記密碼失敗：找不到用戶 ${email}`)
      throw new NotFoundException('找不到該電子信箱註冊的用戶')
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()

    await this.cacheManager.set(`reset_pwd:${email}`, code, 'EX', 600000)

    await this.notificationsService.sendEmail(
      email,
      TemplateName.RESET_PASSWORD,
      { code }
    )
    this.logger.log(`重設密碼驗證碼已生成 (模擬發信): ${email} -> ${code}`)

    return { message: '重設密碼驗證信已發送' }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const { email, verificationCode, newPassword } = dto
    this.logger.log(`嘗試執行重設密碼: ${email}`)

    const cachedCode = await this.cacheManager.get(`reset_pwd:${email}`)

    if (!cachedCode || cachedCode !== verificationCode) {
      this.logger.warn(`重設密碼失敗：驗證碼錯誤或過期 - ${email}`)
      throw new BadRequestException('驗證碼錯誤或已過期')
    }

    const user = await this.usersRepository.findOne({ where: { email } })
    if (!user) {
      throw new NotFoundException('用戶不存在')
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedPassword

    await this.usersRepository.save(user)
    this.logger.log(`用戶密碼已成功重設: ${email}`)

    await this.cacheManager.del(`reset_pwd:${email}`)

    return { message: '密碼重設成功' }
  }

  async addFavorite(userId: string, welfareId: string): Promise<void> {
    this.logger.log(`用戶 ${userId} 嘗試收藏福利 ${welfareId}`)

    const welfare = await this.welfareRepository.findOne({ where: { id: welfareId } })
    if (!welfare) {
      throw new NotFoundException('福利不存在')
    }

    const count = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.favoriteWelfares', 'welfare')
      .where('user.id = :userId', { userId })
      .andWhere('welfare.id = :welfareId', { welfareId })
      .getCount()

    if (count > 0) {
      throw new ConflictException('已收藏過此福利')
    }

    await this.usersRepository
      .createQueryBuilder()
      .relation(User, 'favoriteWelfares')
      .of(userId)
      .add(welfareId)

    this.logger.log(`收藏成功：User ${userId} -> Welfare ${welfareId}`)
  }

  async removeFavorite(userId: string, welfareId: string): Promise<void> {
    this.logger.log(`用戶 ${userId} 嘗試移除收藏福利 ${welfareId}`)

    await this.usersRepository
      .createQueryBuilder()
      .relation(User, 'favoriteWelfares')
      .of(userId)
      .remove(welfareId)

    this.logger.log(`移除收藏成功：User ${userId} -> Welfare ${welfareId}`)
  }

  async getFavorites(userId: string): Promise<Welfare[]> {
    this.logger.log(`查詢用戶 ${userId} 的收藏列表`)

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['favoriteWelfares'],
      order: {
        favoriteWelfares: {
          createdAt: 'DESC',
        },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user.favoriteWelfares
  }
}
