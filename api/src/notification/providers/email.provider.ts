import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

@Injectable()
export class EmailProvider {
  private readonly resend: Resend
  private readonly logger = new Logger(EmailProvider.name)

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'))
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    this.logger.log(`正在透過 Resend 發送郵件給: ${to}`)

    const { error } = await this.resend.emails.send({
      from: this.configService.get<string>('EMAIL_FROM', 'bots@cherites.org'),
      to,
      subject,
      html,
    })

    if (error) {
      this.logger.error(`Resend 發送失敗: ${error.message}`)
      throw new Error(error.message)
    }

    this.logger.log(`郵件發送成功: ${to}`)
  }
}
