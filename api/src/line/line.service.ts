import { FlexBubble, FlexComponent, FlexMessage, Message, messagingApi, TextMessage } from '@line/bot-sdk'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Repository } from 'typeorm'
import { ChatService } from '../chat/chat.service.js'
import { MessageMetadata } from '../chat/entities/chat-message.entity.js'
import { ChatSession } from '../chat/entities/chat-session.entity.js'
import { User } from '../user/entities/user.entity.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { WelfaresService } from '../welfare/welfare.service.js'

@Injectable()
export class LineService {
  private readonly client: messagingApi.MessagingApiClient
  private readonly logger = new Logger(LineService.name)
  private readonly channelSecret: string
  private readonly frontendUrl: string

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
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://google.com'
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.getOrThrow<string>('LINE_MESSAGEING_ACCESS_TOKEN'),
    })
  }

  async handleEvent(event: any) {
    try {
      if (event.type !== 'message' || event.message.type !== 'text') {
        return
      }

      const lineUserId = event.source.userId
      const userMessage = event.message.text
      const replyToken = event.replyToken

      this.logger.log(`收到 LINE 訊息: ${lineUserId} - ${userMessage}`)

      const user = await this.userRepository.findOne({ where: { lineId: lineUserId } })

      if (!user) {
        await this.handleGuestUser(replyToken)
        return
      }

      await this.handleRegisteredUser(user, userMessage, replyToken)
    } catch (error) {
      this.logger.error('處理 LINE 事件時發生錯誤', error)
    }
  }

  private async handleGuestUser(replyToken: string) {
    const randomWelfares = await this.welfaresService.findRandom(3)
    const messages: Message[] = [
      {
        type: 'text',
        text: '您尚未綁定帳號，無法使用智慧對話功能。\n\n請點擊以下連結進行綁定 (範例連結)，或是參考下方為您隨機推薦的福利：',
      },
    ]

    if (randomWelfares && randomWelfares.length > 0) {
      const carouselMessage = this.buildWelfareCarousel(randomWelfares)
      messages.push(carouselMessage)
    }

    await this.client.replyMessage({
      replyToken,
      messages: messages as any,
    })
  }

  private async handleRegisteredUser(user: User, message: string, replyToken: string) {
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

    if (sessionCount >= 3) {
      const randomWelfares = await this.welfaresService.findRandom(3)
      const messages: Message[] = [
        {
          type: 'text',
          text: '抱歉，您今日的免費智慧對話次數已達上限 (3次)。\n\n我們明天見！在此之前，您可以看看這些推薦福利：',
        },
      ]

      if (randomWelfares && randomWelfares.length > 0) {
        messages.push(this.buildWelfareCarousel(randomWelfares))
      }

      await this.client.replyMessage({
        replyToken,
        messages: messages as any,
      })
      return
    }

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

    const aiResult = await this.chatService.handleMessage(user.id, null, sessionId, message, true, false)

    const messages: Message[] = [
      { type: 'text', text: aiResult.reply }
    ]

    if (aiResult.metadata?.isConverged && Array.isArray(aiResult.metadata.ragSources) && aiResult.metadata.ragSources.length > 0) {
      const flexMessage = this.createRagResultFlex(aiResult.metadata)
      messages.push(flexMessage)
    }

    await this.client.replyMessage({
      replyToken,
      messages: messages as any,
    })
  }

  private buildWelfareCarousel(welfares: Welfare[]): FlexMessage {
    const safeWelfares = welfares.slice(0, 10)

    const bubbles: FlexBubble[] = safeWelfares.map((welfare) => ({
      type: 'bubble',
      size: 'micro',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#03C75A',
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
            text: welfare.name || '福利名稱',
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
              uri: `${this.frontendUrl}/welfare/${welfare.id}`,
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

  private createRagResultFlex(metadata: MessageMetadata): FlexMessage | TextMessage {
    const sources = metadata.ragSources || []

    if (sources.length === 0) {
      return {
        type: 'text',
        text: '抱歉，未找到相關的福利資源。',
      }
    }

    const safeSources = sources.slice(0, 10)

    const bubbles: FlexBubble[] = safeSources.map((source) => {
      // --- Tags：縣市 + 福利種類（最多 2 個）---
      const tags: FlexComponent[] = []

      if (source.sourceCity) {
        tags.push({
          type: 'box',
          layout: 'baseline',
          contents: [{ type: 'text', text: source.sourceCity, size: 'xs', color: '#005c4b', weight: 'bold', flex: 0, margin: 'none' }],
          backgroundColor: '#e0f2f1',
          cornerRadius: '20px',
          paddingAll: 'xs',
          paddingStart: 'md',
          paddingEnd: 'md',
          margin: 'sm',
          flex: 0,
        })
      }

      source.categories?.slice(0, 2).forEach((cat) => {
        tags.push({
          type: 'box',
          layout: 'baseline',
          contents: [{ type: 'text', text: cat, size: 'xs', color: '#555555', flex: 0, margin: 'none' }],
          backgroundColor: '#f5f5f5',
          cornerRadius: '20px',
          paddingAll: 'xs',
          paddingStart: 'md',
          paddingEnd: 'md',
          margin: 'sm',
          flex: 0,
        })
      })

      // --- 適配燈號文字 ---
      const matchLight: string | null = source.userMatch?.light ?? null
      const matchColorMap: Record<string, string> = { GREEN: '#00b900', YELLOW: '#f5a623', RED: '#e53935' }
      const matchLabelMap: Record<string, string> = { GREEN: '✓ 符合資格', YELLOW: '△ 部分符合', RED: '✗ 不符資格' }

      // --- 截止日期 ---
      const deadlineText = source.deadline
        ? `截止日期：${new Date(source.deadline).toLocaleDateString('zh-TW')}`
        : null

      // --- Body contents ---
      const bodyContents: FlexComponent[] = [
        {
          type: 'text',
          text: source.title || '無標題資源',
          weight: 'bold',
          size: 'lg',
          color: '#1f1f1f',
          wrap: true,
          maxLines: 2,
        },
      ]

      if (tags.length > 0) {
        bodyContents.push({
          type: 'box',
          layout: 'horizontal',
          contents: tags,
          margin: 'md',
          spacing: 'sm',
        } as any)
      }

      if (matchLight && matchColorMap[matchLight]) {
        bodyContents.push({
          type: 'text',
          text: matchLabelMap[matchLight],
          size: 'xs',
          color: matchColorMap[matchLight],
          weight: 'bold',
          margin: 'md',
        })
      }

      bodyContents.push({
        type: 'text',
        text: source.summaryContent || '點擊下方按鈕查看更多詳細資訊...',
        size: 'sm',
        color: '#888888',
        wrap: true,
        margin: 'md',
        maxLines: 3,
        lineSpacing: '4px',
      })

      if (deadlineText) {
        bodyContents.push({
          type: 'text',
          text: `⏰ ${deadlineText}`,
          size: 'xs',
          color: '#e53935',
          margin: 'sm',
        })
      }

      return {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: bodyContents,
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: 'none',
          contents: [
            { type: 'separator', color: '#f0f0f0', margin: 'none' },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: { type: 'uri', label: '查看完整內容', uri: source.uri || this.frontendUrl },
              color: '#00b900',
              margin: 'sm',
            },
          ],
        },
        styles: { footer: { separator: false } },
      }
    })

    return {
      type: 'flex',
      altText: `為您找到 ${safeSources.length} 筆福利資源`,
      contents: { type: 'carousel', contents: bubbles },
    }
  }
}
