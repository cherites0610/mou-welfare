import { messagingApi } from '@line/bot-sdk'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Repository } from 'typeorm'
import { ChatService } from '../chat/chat.service.js'
import { ChatSession } from '../chat/entities/chat-session.entity.js'
import { User } from '../user/entities/user.entity.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { WelfaresService } from '../welfare/welfare.service.js'

@Injectable()
export class LineService {
  private readonly client: messagingApi.MessagingApiClient
  private readonly logger = new Logger(LineService.name)
  private readonly channelSecret: string

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    private readonly chatService: ChatService,
    private readonly welfaresService: WelfaresService,
  ) {
    this.channelSecret = this.configService.getOrThrow<string>('LINE_MESSAGEING_SECRET')
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.getOrThrow<string>('LINE_MESSAGEING_ACCESS_TOKEN'),
    })
  }

  // 處理 Webhook 事件的進入點
  async handleEvent(event: any) {
    if (event.type !== 'message' || event.message.type !== 'text') {
      return
    }

    const lineUserId = event.source.userId
    const userMessage = event.message.text
    const replyToken = event.replyToken

    this.logger.log(`收到 LINE 訊息: ${lineUserId} - ${userMessage}`)

    // 1. 身份識別
    const user = await this.userRepository.findOne({ where: { lineId: lineUserId } })

    // === 分支 A: 未綁定用戶 ===
    if (!user) {
      await this.handleGuestUser(replyToken)
      return
    }

    // === 分支 B: 已綁定用戶 ===
    await this.handleRegisteredUser(user, userMessage, replyToken)
  }

  // 處理未登入用戶邏輯
  private async handleGuestUser(replyToken: string) {
    // 1. 撈取隨機福利
    const randomWelfares = await this.welfaresService.findRandom(3)

    // 2. 構建 Carousel Flex Message
    const carouselMessage = this.buildWelfareCarousel(randomWelfares)

    // 3. 回覆訊息 (提示登入 + 推薦)
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: '您尚未綁定帳號，無法使用智慧對話功能。\n\n請點擊以下連結進行綁定 (範例連結)，或是參考下方為您隨機推薦的福利：',
        },
        carouselMessage,
      ],
    })
  }

  // 處理已登入用戶邏輯
  private async handleRegisteredUser(user: User, message: string, replyToken: string) {
    // 1. 檢查今日配額 (3次)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const sessionCount = await this.sessionRepository.count({
      where: {
        userId: user.id,
        createdAt: Between(startOfDay, endOfDay),
      },
    })

    // === 狀況 B-1: 配額已滿 ===
    if (sessionCount >= 3) {
      const randomWelfares = await this.welfaresService.findRandom(3)
      const carouselMessage = this.buildWelfareCarousel(randomWelfares)

      await this.client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text',
            text: '抱歉，您今日的免費智慧對話次數已達上限 (3次)。\n\n我們明天見！在此之前，您可以看看這些推薦福利：',
          },
          carouselMessage,
        ],
      })
      return
    }

    // === 狀況 B-2: 配額未滿，檢查合併 ===
    const lastSession = await this.sessionRepository.findOne({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
    })

    let sessionId: string | null = null
    if (lastSession) {
      const now = new Date().getTime()
      const lastUpdate = lastSession.updatedAt.getTime()
      const diffMinutes = (now - lastUpdate) / 1000 / 60

      if (diffMinutes <= 5) {
        sessionId = lastSession.id
        this.logger.log(`合併至既有對話: ${sessionId}`)
      }
    }

    // 2. 呼叫 ChatService 處理 AI 對話
    // 注意：ChatService 回傳的是一個物件 { reply, metadata ... }
    const aiResult = await this.chatService.handleMessage(user.id, null, sessionId, message)

    // 3. 回覆 AI 的答案
    await this.client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: aiResult.reply }],
    })
  }

  // --- 輔助方法：製作 LINE Flex Carousel ---
  private buildWelfareCarousel(welfares: Welfare[]): any {
    const bubbles = welfares.map((welfare) => ({
      type: 'bubble',
      size: 'micro', // 使用小尺寸卡片
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#03C75A', // LINE 綠色風格
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: welfare.sourceCity || '全國',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: welfare.name,
            weight: 'bold',
            size: 'sm',
            wrap: true,
            maxLines: 2,
          },
          {
            type: 'text',
            text: welfare.summaryContent || '暫無摘要',
            size: 'xs',
            color: '#888888',
            wrap: true,
            maxLines: 3,
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '查看詳情',
              uri: welfare.sourceUrl || 'https://google.com',
            },
            style: 'secondary',
            height: 'sm',
          },
        ],
      },
    }))

    return {
      type: 'flex',
      altText: '為您推薦的福利補助',
      contents: {
        type: 'carousel',
        contents: bubbles,
      },
    }
  }
}
