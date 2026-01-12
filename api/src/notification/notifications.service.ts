import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { NotificationLog, NotificationStatus } from './entities/notification-log.entity.js'
import { IMessage } from './interfaces/message.interface.js'
import { TemplateService } from './template.service.js'
import { TemplateName } from './templates/notification-templates.js'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    private readonly templateService: TemplateService,
  ) { }

  // 私有方法：統一處理 Log 建立與 Queue 推送
  private async dispatch(
    message: IMessage,
    contentPreview: string,
    title?: string,
  ) {
    // 1. 先持久化 Log
    const log = this.logRepository.create({
      target: message.to,
      type: message.type,
      status: NotificationStatus.PENDING,
      title,
      content: contentPreview, // 可存完整的 HTML 或僅存摘要
    })
    const savedLog = await this.logRepository.save(log)

    // 2. 推送至 Queue (帶上 logId)
    await this.notificationsQueue.add(
      'send-notification',
      { logId: savedLog.id, message },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    )

    this.logger.log(`通知已排程 LogID: ${savedLog.id}, Target: ${message.to}`)
  }

  async sendEmail(
    to: string,
    templateName: TemplateName,
    data: any,
  ) {
    // Build Message
    const message = this.templateService.buildEmail(to, templateName, data)
    // Dispatch
    await this.dispatch(message, message.html, message.subject)
  }

  async sendLine(
    to: string | null,
    templateName: TemplateName,
    data: any,
  ) {
    if (!to) {
      return
    }
    const message = this.templateService.buildLine(to, templateName, data)
    await this.dispatch(message, message.text)
  }
}
