import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Redis } from 'ioredis'
import { Repository } from 'typeorm'
import { Family } from '../family/entities/family.entity.js'
import { NotificationsService } from '../notification/notifications.service.js'
import { TemplateName } from '../notification/templates/notification-templates.js'
import { REDIS_CLIENT } from '../redis/redis.module.js'
import { CreateUserFamilyDto } from './dtos/create-user-family.dto.js'
import { UpdateUserFamilyDto } from './dtos/update-user-family.dto.js'
import { UserFamily } from './entities/user-family.entity.js'

@Injectable()
export class UserFamiliesService {
  private readonly logger = new Logger(UserFamiliesService.name)

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(UserFamily)
    private readonly userFamilyRepository: Repository<UserFamily>,
    @InjectRepository(Family)
    private readonly familiesRepository: Repository<Family>,
    @Inject(REDIS_CLIENT)
    private readonly cacheManager: Redis,
  ) { }

  async addMember(dto: CreateUserFamilyDto): Promise<UserFamily> {
    this.logger.log(`嘗試新增家庭成員: Family ${dto.familyId}, User ${dto.userId}`)

    const existingMember = await this.userFamilyRepository.findOne({
      where: { familyId: dto.familyId, userId: dto.userId },
    })

    if (existingMember) {
      this.logger.warn(`新增失敗：該用戶已是家庭成員`)
      throw new ConflictException('該用戶已是此家庭的成員')
    }

    const member = this.userFamilyRepository.create(dto)
    const savedMember = await this.userFamilyRepository.save(member)

    await this.cacheManager.del(`family_members:${dto.familyId}`)
    this.logger.log(`成員新增成功 ID: ${savedMember.id}`)

    const familyMember = await this.userFamilyRepository.findOne({
      where: { id: savedMember.id },
      relations: ['user', 'family'],
    })

    this.notificationsService.sendEmail(familyMember!.user.email, TemplateName.WELCOME_FAMILY, { familyName: familyMember!.family.name, role: savedMember.role })
    this.notificationsService.sendLine(familyMember!.user.lineId, TemplateName.WELCOME_FAMILY, { familyName: familyMember!.family.name, role: savedMember.role })
    return savedMember
  }

  async findByFamilyId(familyId: string, currentUserId: string): Promise<UserFamily[]> {
    const isMember = await this.userFamilyRepository.findOne({
      where: { familyId, userId: currentUserId },
    })

    if (!isMember) {
      this.logger.warn(`查詢失敗：用戶 ${currentUserId} 非家庭 ${familyId} 成員`)
      throw new ForbiddenException('您不是該家庭的成員，無權查看')
    }

    const cacheKey = `family_members:${familyId}`
    const cachedMembers = await this.cacheManager.get(cacheKey)

    if (cachedMembers) {
      this.logger.debug(`從快取讀取家庭成員列表 Family ID: ${familyId}`)
      return JSON.parse(cachedMembers)
    }

    this.logger.log(`從資料庫查詢家庭成員列表 Family ID: ${familyId}`)
    const members = await this.userFamilyRepository.find({
      where: { familyId },
      relations: ['user'],
    })

    await this.cacheManager.set(cacheKey, JSON.stringify(members), 'EX', 3600)
    return members
  }

  async updateMemberRole(
    id: string,
    dto: UpdateUserFamilyDto,
    currentUserId: string
  ): Promise<UserFamily> {
    this.logger.log(`嘗試更新成員身份 ID: ${id}, 操作者: ${currentUserId}`)

    const targetMember = await this.userFamilyRepository.findOne({ where: { id } })
    if (!targetMember) {
      throw new NotFoundException('找不到該成員記錄')
    }

    const requester = await this.userFamilyRepository.findOne({
      where: { familyId: targetMember.familyId, userId: currentUserId },
    })

    if (!requester || requester.role !== 'Admin') {
      this.logger.warn(`權限不足：用戶 ${currentUserId} 嘗試修改身份`)
      throw new ForbiddenException('只有管理員可以更新成員權限')
    }

    if (targetMember.role === 'Admin' && dto.role !== 'Admin') {
      const adminCount = await this.userFamilyRepository.count({
        where: { familyId: targetMember.familyId, role: 'Admin' }
      })
      if (adminCount <= 1) {
        throw new ForbiddenException('無法移除唯一的管理員，請先指派另一位成員為管理員')
      }
    }

    targetMember.role = dto.role
    const updatedMember = await this.userFamilyRepository.save(targetMember)

    await this.cacheManager.del(`family_members:${targetMember.familyId}`)
    this.logger.log(`成員身份更新完成 ID: ${id}`)

    return updatedMember
  }

  async removeMember(id: string, currentUserId: string): Promise<void> {
    this.logger.log(`嘗試移除家庭成員 ID: ${id}, 操作者: ${currentUserId}`)

    const targetMember = await this.userFamilyRepository.findOne({ where: { id } })
    if (!targetMember) {
      throw new NotFoundException('找不到該成員記錄')
    }

    const familyId = targetMember.familyId

    const requester = await this.userFamilyRepository.findOne({
      where: { familyId, userId: currentUserId },
    })

    if (!requester) {
      throw new ForbiddenException('您不是該家庭的成員')
    }

    if (targetMember.userId !== currentUserId && requester.role !== 'Admin') {
      this.logger.warn(`權限不足：用戶 ${currentUserId} 嘗試移除他人`)
      throw new ForbiddenException('只有管理員可以移除其他成員')
    }

    if (targetMember.role === 'Admin') {
      const remainingMembersCount = await this.userFamilyRepository.count({ where: { familyId } })

      if (remainingMembersCount > 1) {
        const otherAdminsCount = await this.userFamilyRepository.count({
          where: { familyId, role: 'Admin' }
        })
        if (otherAdminsCount <= 1) {
          this.logger.warn(`移除失敗：嘗試移除唯一的管理員`)
          throw new BadRequestException('無法移除最後一位管理員，請在退出前指定新的管理員')
        }
      }
    }

    await this.userFamilyRepository.remove(targetMember)
    await this.cacheManager.del(`family_members:${familyId}`)
    this.logger.log(`成員已移除 ID: ${id}`)

    const memberCount = await this.userFamilyRepository.count({ where: { familyId } })
    if (memberCount === 0) {
      this.logger.log(`家庭 ${familyId} 已無成員，執行自動刪除`)
      await this.familiesRepository.delete(familyId)
      await this.cacheManager.del(`family:${familyId}`)
    }
  }

  async generateInviteCode(familyId: string, userId: string): Promise<{ code: string; expiresIn: number }> {
    this.logger.log(`用戶 ${userId} 請求生成家庭 ${familyId} 的邀請碼`)

    const requester = await this.userFamilyRepository.findOne({
      where: { familyId, userId },
    })

    if (!requester) {
      this.logger.warn(`生成失敗：用戶 ${userId} 不是家庭 ${familyId} 的成員`)
      throw new ForbiddenException('您必須是該家庭成員才能產生邀請碼')
    }

    let code = ''
    let isUnique = false

    while (!isUnique) {
      code = Math.floor(100000 + Math.random() * 900000).toString()
      const exists = await this.cacheManager.get(`invite_code:${code}`)
      if (!exists) {
        isUnique = true
      }
    }

    const ttl = 600
    await this.cacheManager.set(`invite_code:${code}`, familyId, 'EX', ttl)

    this.logger.log(`邀請碼已生成: ${code} (Family: ${familyId})`)

    return { code, expiresIn: ttl }
  }

  async joinByCode(code: string, userId: string): Promise<UserFamily> {
    this.logger.log(`用戶 ${userId} 嘗試使用代碼 ${code} 加入家庭`)

    const familyId = await this.cacheManager.get(`invite_code:${code}`)

    if (!familyId) {
      this.logger.warn(`加入失敗：代碼 ${code} 無效或已過期`)
      throw new BadRequestException('邀請碼無效或已過期')
    }

    const existingMember = await this.userFamilyRepository.findOne({
      where: { familyId, userId },
    })

    if (existingMember) {
      this.logger.warn(`加入失敗：用戶 ${userId} 已經在家庭 ${familyId} 中`)
      throw new ConflictException('您已經是該家庭的成員')
    }

    const newMember = this.userFamilyRepository.create({
      familyId,
      userId,
      role: 'Member',
    })

    const savedMember = await this.userFamilyRepository.save(newMember)

    await this.cacheManager.del(`family_members:${familyId}`)
    this.logger.log(`用戶 ${userId} 成功透過代碼加入家庭 ${familyId}`)

    const familyMember = await this.userFamilyRepository.findOne({
      where: { familyId, userId },
      relations: ['user', 'family'],
    })

    this.notificationsService.sendEmail(familyMember!.user.email, TemplateName.WELCOME_FAMILY, { familyName: familyMember!.family.name, role: savedMember.role })
    this.notificationsService.sendLine(familyMember!.user.lineId, TemplateName.WELCOME_FAMILY, { familyName: familyMember!.family.name, role: savedMember.role })

    return savedMember
  }
}
