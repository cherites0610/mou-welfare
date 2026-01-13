import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { Repository } from 'typeorm'
import { IngestWelfareDto } from '../dtos/ingest-welfare.dto.js'
import { Welfare } from '../entities/welfare.entity.js'
import { GcsService } from './gcs.service.js'
import { WelfareLlmService } from './welfare-llm.service.js'

@Processor('welfare-processing')
export class WelfaresProcessor extends WorkerHost {
  private readonly logger = new Logger(WelfaresProcessor.name)

  constructor(
    @InjectRepository(Welfare)
    private readonly welfareRepository: Repository<Welfare>,
    private readonly welfareLlmService: WelfareLlmService,
    private readonly gcsService: GcsService,
  ) {
    super()
  }

  async process(job: Job<IngestWelfareDto>): Promise<void> {
    const data = job.data
    this.logger.log(`開始處理福利資料 Job ID: ${job.id}, Name: ${data.originalName}`)

    try {
      const existingWelfare = await this.welfareRepository.findOne({
        where: { sourceUrl: data.sourceUrl },
      })

      if (existingWelfare) {
        this.logger.log(`資料已存在，跳過或更新: ${data.sourceUrl}`)
        return
      }

      const analysisResult = await this.welfareLlmService.analyze(data)

      const welfare = this.welfareRepository.create({
        originalName: data.originalName,
        sourceCity: data.sourceCity,
        sourceUrl: data.sourceUrl,
        publishDate: data.publishDate ? new Date(data.publishDate) : undefined,
        originalContent: data.originalContent,
        ...analysisResult,
        deadline: analysisResult.deadline ? new Date(analysisResult.deadline) : undefined,
      })

      await this.welfareRepository.save(welfare)
      await this.gcsService.appendAndUpload([welfare])
      this.logger.log(`福利資料處理並儲存成功 ID: ${welfare.id}`)

    } catch (error) {
      this.logger.error(`處理失敗 Job ID: ${job.id}, Error: ${error.message}`, error.stack)
      throw error
    }
  }
}
