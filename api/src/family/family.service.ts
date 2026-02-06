import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Redis } from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { REDIS_CLIENT } from '../redis/redis.module.js'
import { UserFamily } from '../user-family/entities/user-family.entity.js'
import { User } from '../user/entities/user.entity.js'
import { CreateFamilyDto } from './dtos/create-family.dto.js'
import { UpdateFamilyDto } from './dtos/update-family.dto.js'
import { Family } from './entities/family.entity.js'

@Injectable()
export class FamiliesService {
  private readonly logger = new Logger(FamiliesService.name)

  constructor(
    @InjectRepository(Family)
    private readonly familiesRepository: Repository<Family>,
    @Inject(REDIS_CLIENT)
    private readonly cacheManager: Redis,
    private readonly dataSource: DataSource,
  ) { }

  async create(createFamilyDto: CreateFamilyDto, user: User): Promise<Family> {
    this.logger.log(`開始建立新家庭流程: ${createFamilyDto.name}, 建立者 ID: ${user.id}`)

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. 建立 Family 實體
      const newFamily = queryRunner.manager.create(Family, createFamilyDto)
      const savedFamily = await queryRunner.manager.save(newFamily)
      this.logger.log(`家庭實體已建立 ID: ${savedFamily.id}`)

      // 2. 建立 UserFamily 實體 (將建立者設為 Admin)
      const newMember = queryRunner.manager.create(UserFamily, {
        userId: user.id,
        familyId: savedFamily.id,
        role: 'Admin', // 預設建立者為管理員
      })
      await queryRunner.manager.save(newMember)
      this.logger.log(`建立者已加入家庭成員關聯 ID: ${newMember.id}`)

      // 3. 提交交易
      await queryRunner.commitTransaction()
      this.logger.log(`家庭建立流程圓滿完成 ID: ${savedFamily.id}`)

      return savedFamily
    } catch (error) {
      // 發生錯誤時回滾
      this.logger.error(`建立家庭失敗，執行回滾: ${error.message}`, error.stack)
      await queryRunner.rollbackTransaction()
      throw new InternalServerErrorException('Failed to create family')
    } finally {
      // 釋放連線
      await queryRunner.release()
    }
  }

  async findAll(userId: string): Promise<Family[]> {
    return this.familiesRepository.createQueryBuilder('family')
      .innerJoin('family.userFamilies', 'filterMyMembership')
      .leftJoinAndSelect('family.userFamilies', 'allMembers')
      .leftJoinAndSelect('allMembers.user', 'memberDetails')
      .where('filterMyMembership.userId = :userId', { userId })
      .getMany()
  }

  async findOne(id: string): Promise<Family> {
    const cacheKey = `family:${id}`
    const cachedFamily = await this.cacheManager.get(cacheKey)

    if (cachedFamily) {
      this.logger.debug(`從快取讀取家庭資料 ID: ${id}`)
      return JSON.parse(cachedFamily)
    }

    this.logger.log(`從資料庫查詢家庭資料 ID: ${id}`)
    const family = await this.familiesRepository.findOne({
      where: { id },
      relations: ['userFamilies']
    })

    if (!family) {
      this.logger.warn(`查詢失敗：找不到家庭 ID ${id}`)
      throw new NotFoundException(`找不到家庭`)
    }

    await this.cacheManager.set(cacheKey, JSON.stringify(family), 'EX', 3600000)
    return family
  }

  async update(id: string, updateFamilyDto: UpdateFamilyDto): Promise<Family> {
    this.logger.log(`嘗試更新家庭資料 ID: ${id}`)

    const family = await this.findOne(id)

    Object.assign(family, updateFamilyDto)
    const updatedFamily = await this.familiesRepository.save(family)

    await this.cacheManager.del(`family:${id}`)
    this.logger.log(`家庭資料更新完成並清除快取 ID: ${id}`)

    return updatedFamily
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`嘗試刪除家庭 ID: ${id}`)

    const result = await this.familiesRepository.delete(id)

    if (result.affected === 0) {
      this.logger.warn(`刪除失敗：找不到家庭 ID ${id}`)
      throw new NotFoundException(`找不到家庭`)
    }

    await this.cacheManager.del(`family:${id}`)
    this.logger.log(`家庭已刪除並清除快取 ID: ${id}`)
  }
}
