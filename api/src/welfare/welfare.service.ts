import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { UserFamily } from '../user-family/entities/user-family.entity.js'
import { User } from '../user/entities/user.entity.js'
import { IngestWelfareDto } from './dtos/ingest-welfare.dto.js'
import { SearchWelfareDto } from './dtos/search-welfare.dto.js'
import { Welfare } from './entities/welfare.entity.js'
import { FamilyMatch, MatchResult } from './interfaces/traffic-light.interface.js'
import { WelfareResponse } from './interfaces/welfare-response.interface.js'
import { GcsService } from './services/gcs.service.js'
import { WelfareMatchingService } from './services/welfare-matching.service.js'

@Injectable()
export class WelfaresService {
  private readonly logger = new Logger(WelfaresService.name);

  constructor(
    @InjectQueue('welfare-processing') private readonly welfareQueue: Queue,
    @InjectRepository(Welfare)
    private readonly welfareRepository: Repository<Welfare>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserFamily)
    private readonly userFamilyRepository: Repository<UserFamily>,
    private readonly matchingService: WelfareMatchingService,
    private readonly gcsService: GcsService,
  ) { }

  async ingest(dto: IngestWelfareDto): Promise<{ message: string; jobId: string }> {
    this.logger.log(`開始處理福利資料推送: ${dto.originalName}`)

    const job = await this.welfareQueue.add('analyze-welfare', dto, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })

    this.logger.log(`任務已成功加入佇列, JobID: ${job.id}`)

    return {
      message: '資料已推入處理佇列',
      jobId: job.id!,
    }
  }

  async deleteByCity(city: string): Promise<{ deletedCount: number }> {
    this.logger.log(`執行刪除作業: ${city}`)

    const deleteResult = await this.welfareRepository.delete({ sourceCity: city })
    const dbDeletedCount = deleteResult.affected || 0
    this.logger.log(`DB 已刪除 ${dbDeletedCount} 筆 ${city} 資料`)

    await this.gcsService.removeByCity(city)

    return { deletedCount: dbDeletedCount }
  }

  async search(dto: SearchWelfareDto): Promise<{ data: WelfareResponse[]; total: number }> {
    this.logger.log(`執行福利搜尋, 模式: ${dto.familyId ? '家庭' : dto.userId ? '個人' : '手動'}`)

    const queryBuilder = this.welfareRepository.createQueryBuilder('welfare')
      .select([
        'welfare.id',
        'welfare.name',
        'welfare.sourceCity',
        'welfare.requirements',
        'welfare.identity',
        'welfare.categories',
      ])

    if (dto.keywords) {
      queryBuilder.andWhere('(welfare.name LIKE :kw)', { kw: `%${dto.keywords}%` })
    }

    if (dto.cities && dto.cities.length > 0) {
      queryBuilder.andWhere('welfare.sourceCity IN (:...cities)', { cities: dto.cities })
    }

    if (dto.categories && dto.categories.length > 0) {
      queryBuilder.andWhere('welfare.categories IN (:...categories)', { categories: dto.categories })
    }

    const lightWelfares = await queryBuilder.getMany()
    this.logger.log(`初步篩選完成, 共有 ${lightWelfares.length} 筆資料進入比對`)

    let sortedResults: WelfareResponse[] = []

    if (dto.identities) {
      sortedResults = this.processManualMode(lightWelfares, dto.identities)
    } else if (dto.familyId) {
      sortedResults = await this.processFamilyMode(lightWelfares, dto.familyId, dto.userId)
    } else if (dto.userId) {
      sortedResults = await this.processUserMode(lightWelfares, dto.userId)
    } else {
      sortedResults = lightWelfares as unknown as WelfareResponse[]
    }

    const total = sortedResults.length
    const startIndex = (dto.page - 1) * dto.limit
    const targetSlice = sortedResults.slice(startIndex, startIndex + dto.limit)

    this.logger.log(`排序與分頁完成, 當前頁碼: ${dto.page}, 取得 ${targetSlice.length} 筆資料進行詳細查詢`)

    if (targetSlice.length === 0) {
      return { data: [], total }
    }

    const targetIds = targetSlice.map(w => w.id)
    const fullDetails = await this.welfareRepository.createQueryBuilder('welfare')
      .where('welfare.id IN (:...ids)', { ids: targetIds })
      .getMany()

    const finalData = targetSlice.map(lightItem => {
      const fullDetail = fullDetails.find(f => f.id === lightItem.id)
      return {
        ...lightItem,
        ...fullDetail,
      }
    })

    this.logger.log(`詳細資料合併完成, 準備回傳結果`)
    return { data: finalData, total }
  }

  private processManualMode(welfares: Welfare[], identities: string[]): WelfareResponse[] {
    this.logger.log(`進入手動模擬模式, 模擬身分: ${identities.join(',')}`)
    const mockUser = {
      id: "uuid",
      identities: identities,
      gender: null,
      birthday: null,
    } as unknown as User

    const results = welfares.map((welfare) => {
      const match = this.matchingService.calculate(mockUser, welfare)
      return { ...welfare, match }
    })

    return results.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
  }

  private async processUserMode(welfares: Welfare[], userId: string): Promise<WelfareResponse[]> {
    this.logger.log(`進入個人查詢模式, UserID: ${userId}`)
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      this.logger.warn(`找不到使用者 ${userId}, 跳過比對計算`)
      return welfares as unknown as WelfareResponse[]
    }

    const results = welfares.map((welfare) => {
      const match = this.matchingService.calculate(user, welfare)
      return { ...welfare, match }
    })

    return results.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
  }

  private async processFamilyMode(
    welfares: Welfare[],
    familyId: string,
    currentUserId?: string,
  ): Promise<WelfareResponse[]> {
    this.logger.log(`進入家庭查詢模式, FamilyID: ${familyId}`)
    const allMembers = await this.userFamilyRepository.find({
      where: { familyId },
      relations: ['user'],
    })

    if (!allMembers.length) {
      this.logger.warn(`家庭 ${familyId} 無成員資料`)
      return welfares.map(w => ({ ...w })) as unknown as WelfareResponse[]
    }

    let currentUserUser: User | null = null
    const otherMembers: { user: User; role: string }[] = []

    for (const member of allMembers) {
      if (!member.user) continue
      if (currentUserId && member.user.id === currentUserId) {
        currentUserUser = member.user
      } else {
        otherMembers.push({ user: member.user, role: member.role })
      }
    }

    const results = welfares.map((welfare) => {
      let myMatchResult: MatchResult | null = null
      let myScore = 0

      if (currentUserUser) {
        myMatchResult = this.matchingService.calculate(currentUserUser, welfare)
        myScore = myMatchResult.score
      }

      let maxFamilyScore = 0
      const familyMatches: FamilyMatch[] = otherMembers.map((member) => {
        const match = this.matchingService.calculate(member.user, welfare)
        if (match.score > maxFamilyScore) maxFamilyScore = match.score
        return {
          userId: member.user.id,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
          match,
        }
      })

      const sortWeight = (myScore * 1000) + maxFamilyScore

      return {
        match: myMatchResult || undefined,
        ...welfare,
        familyMatches,
        overallScore: sortWeight,
      } as WelfareResponse
    })

    return results.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
  }
}
