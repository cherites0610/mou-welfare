import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bullmq'
import { Repository } from 'typeorm'
import { NotificationLog, NotificationStatus, NotificationType } from './entities/notification-log.entity.js'
import { IEmailMessage, ILineMessage, IMessage } from './interfaces/message.interface.js'
import { EmailProvider } from './providers/email.provider.js'
import { LineProvider } from './providers/line.provider.js'

interface JobData {
  logId: number
  message: IMessage
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name)

  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly lineProvider: LineProvider,
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
  ) {
    super()
  }

  async process(job: Job<JobData>): Promise<void> {
    const { logId, message } = job.data
    this.logger.log(`開始處理通知任務 LogID: ${logId}, Type: ${message.type}`)

    try {
      switch (message.type) {
        case NotificationType.EMAIL:
          const emailMsg = message as IEmailMessage
          await this.emailProvider.send(emailMsg.to, emailMsg.subject, emailMsg.html)
          break
        case NotificationType.LINE:
          const lineMsg = message as ILineMessage
          await this.lineProvider.send(lineMsg.to, lineMsg.text)
          break
      }

      await this.logRepository.update(logId, {
        status: NotificationStatus.SUCCESS,
        updatedAt: new Date(),
      })

      this.logger.log(`通知發送成功 LogID: ${logId}`)
    } catch (error) {
      this.logger.error(`通知發送失敗 LogID: ${logId}, Error: ${error.message}`)

      await this.logRepository.update(logId, {
        status: NotificationStatus.FAILED,
        errorMessage: error.message,
        updatedAt: new Date(),
      })

      throw error
    }
  }
}
