import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LineService } from './line.service.js'

@Controller('line')
export class LineController {
  constructor(
    private readonly lineService: LineService,
    private readonly configService: ConfigService,
  ) { }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('x-line-signature') signature: string,
    @Body() body: any, // 這裡需要 raw body 來驗證簽章，NestJS 預設會 parse JSON，可能需要 Middleware 處理 Raw Body
    // 為了簡化，我們先假設 body 已經是 parsed object，但在真實環境需處理 Raw Body 驗證
  ) {
    // 簡單的簽章驗證邏輯 (建議移至 Guard 或 Middleware)
    // const channelSecret = this.configService.get('LINE_CHANNEL_SECRET');
    // const hash = createHmac('sha256', channelSecret).update(JSON.stringify(body)).digest('base64');
    // if (hash !== signature) { throw new UnauthorizedException('Invalid Signature'); }

    const events = body.events

    // 使用 Promise.all 並行處理多個事件 (例如同時有多人發訊)
    await Promise.all(
      events.map((event) => this.lineService.handleEvent(event))
    )

    return 'OK'
  }
}
