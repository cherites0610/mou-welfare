import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class LineProvider {
  private readonly logger = new Logger(LineProvider.name)

  constructor(private readonly configService: ConfigService, private readonly httpService: HttpService) {
  }

  async send(to: string, message: string): Promise<any> {
    this.logger.log(`正在發送 LINE 訊息給: ${to}`)

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to,
            messages: [{ type: 'text', text: message }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.configService.get<string>(
                'LINE_CHANNEL_ACCESS_TOKEN',
              )}`,
            },
          },
        ),
      )

      this.logger.log(`LINE 訊息發送成功: ${to}`)
      return data
    } catch (error) {
      this.logger.error(`LINE 發送失敗: ${error.response?.data?.message || error.message}`)
      throw error
    }
  }
}
