import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcrypt'
import { Repository } from 'typeorm'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { User } from './entities/user.entity.js'

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Welfare)
    private readonly welfareRepository: Repository<Welfare>,
  ) { }

  /**
   * 建立使用者 (純粹資料寫入，不含驗證邏輯)
   */
  async create(userData: Partial<User>): Promise<User> {
    const existingUser = await this.usersRepository.findOne({ where: { email: userData.email } })
    if (existingUser) {
      throw new ConflictException('Email已經存在')
    }

    const newUser = this.usersRepository.create(userData)
    const savedUser = await this.usersRepository.save(newUser)
    this.logger.log(`用戶建立成功：ID ${savedUser.id}, Email ${savedUser.email}`)
    return savedUser
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } })
  }

  /**
   * 特殊查詢：包含密碼欄位 (供 AuthService 使用)
   */
  async findOneByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne()
  }

  async findOneById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } })
    if (!user) {
      throw new NotFoundException('找不到用戶')
    }
    return user
  }

  async update(id: string, updateData: Partial<User>): Promise<User> {
    const user = await this.findOneById(id)
    Object.assign(user, updateData)
    return this.usersRepository.save(user)
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    })

    if (!user) {
      throw new NotFoundException('找不到使用者')
    }

    if (!user.password) {
      throw new BadRequestException('此帳號未設定密碼，無法驗證 (可能是 OAuth 登入)')
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      throw new UnauthorizedException('密碼錯誤，無法刪除帳號')
    }

    await this.usersRepository.delete(userId)
  }

  // --- 使用者福利相關功能 (保留在此) ---

  async addFavorite(userId: string, welfareId: string): Promise<void> {
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
  }

  async removeFavorite(userId: string, welfareId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .relation(User, 'favoriteWelfares')
      .of(userId)
      .remove(welfareId)
  }

  async getFavorites(userId: string): Promise<Welfare[]> {
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

  async findOneByProviderId(source: 'google' | 'line', providerId: string): Promise<User | null> {
    const fieldMap = {
      google: 'googleId',
      line: 'lineId'
    }

    const field = fieldMap[source]

    return this.usersRepository.findOne({
      where: {
        [field]: providerId
      }
    })
  }
}
