import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { LlmService } from '../llm/llm.service.js'
import { LlmProvider } from '../llm/llm.types.js'
import { UserFamily } from '../user-family/entities/user-family.entity.js'
import { User } from '../user/entities/user.entity.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { MatchResult } from '../welfare/interfaces/traffic-light.interface.js'
import { WelfareMatchingService } from '../welfare/services/welfare-matching.service.js'
import { ChatMessage, MessageRole } from './entities/chat-message.entity.js'
import { ChatSession } from './entities/chat-session.entity.js'
import { VertexAiProvider } from './providers/vertex-ai.provider.js'

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(Welfare)
    private readonly welfareRepository: Repository<Welfare>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserFamily)
    private readonly userFamilyRepository: Repository<UserFamily>,
    private readonly vertexAiProvider: VertexAiProvider,
    private readonly llmService: LlmService,
    private readonly matchingService: WelfareMatchingService,
  ) { }

  async getUserSessions(userId: string): Promise<ChatSession[]> {
    return this.sessionRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    })
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } })
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`)
    }

    return this.messageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    const result = await this.sessionRepository.delete(sessionId)
    if (result.affected === 0) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`)
    }
  }

  async handleMessage(
    userId: string, // 操作者 ID
    familyId: string | null, // 選填：家庭 ID
    sessionId: string | null,
    userMessage: string,
  ) {
    // 1. 確保 Session 存在或建立新 Session
    let session: ChatSession | null
    if (sessionId) {
      session = await this.sessionRepository.findOne({ where: { id: sessionId } })
      if (!session) throw new NotFoundException('Session not found')
    } else {
      session = this.sessionRepository.create({ userId, title: userMessage.slice(0, 20) })
      await this.sessionRepository.save(session)
    }

    // 2. 儲存用戶訊息
    await this.saveMessage(session.id, 'user', userMessage)

    // 3. 讀取歷史訊息 (Context)
    const history = await this.messageRepository.find({
      where: { sessionId: session.id },
      order: { createdAt: 'DESC' },
      take: 5,
    })
    const historyContext = history.reverse().map((m) => `${m.role}: ${m.content}`).join('\n')

    this.logger.log(`開始並行處理訊息 Session: ${session.id}`)

    // =========================================================
    // 4. 並行處理 (Parallel Execution): Context Loading + NLU + RAG
    // =========================================================

    const [userData, familyMembers, nluResult, ragSearchResults] = await Promise.all([
      // Task 1: 撈取個人資料 (若有 userId)
      userId ? this.userRepository.findOne({ where: { id: userId } }) : null,

      // Task 2: 撈取家庭成員 (若有 familyId)
      familyId
        ? this.userFamilyRepository.find({
          where: { familyId },
          relations: ['user'],
        })
        : [],

      // Task 3: NLU 意圖識別
      this.extractIntents(userMessage, historyContext),

      // Task 4: RAG 檢索 (回傳的是 Search Result Snippets，包含 ID)
      this.vertexAiProvider.searchWelfareDocs(userMessage),
    ])

    const { city, identities } = nluResult
    this.logger.log(`NLU 提取結果: City=${city}, Identities=${identities}`)
    this.logger.log(`Vertex Search 找到 ${ragSearchResults.length} 筆資料`)

    // =========================================================
    // 5. 資料收斂與紅綠燈計算 (Convergence & Calculation)
    // =========================================================

    // 5.1 實體還原 (Hydration): 拿 ID 去 DB 撈完整的 Welfare (含 requirements 以供計算)
    let enrichedWelfares: any[] = []

    if (ragSearchResults.length > 0) {
      const welfareIds = ragSearchResults.map((r) => r.id).filter(Boolean)

      const fullWelfares = await this.welfareRepository.find({
        where: { id: In(welfareIds) },
      })

      // 5.2 計算紅綠燈
      enrichedWelfares = fullWelfares.map((welfare) => {
        let userMatch: MatchResult | null = null
        let familyMatches: any[] = []

        // A. 計算個人匹配 (如果 User 存在)
        if (userData) {
          userMatch = this.matchingService.calculate(userData, welfare)
        }

        // B. 計算家庭匹配 (如果 Family 存在)
        if (familyMembers.length > 0) {
          familyMatches = familyMembers
            .map((member) => {
              if (!member.user) return null
              // 如果成員是當前用戶，且前面算過了，可以複用，或者重算也無妨
              const match = this.matchingService.calculate(member.user, welfare)
              return {
                userId: member.user.id,
                role: member.role,
                match,
              }
            })
            .filter(Boolean)
        }

        return {
          ...welfare, // 包含 DB 完整資料
          userMatch,  // 個人燈號
          familyMatches, // 家庭燈號列表
        }
      })
    }

    // =========================================================
    // 6. 構建 Prompt Context (Prompt Engineering)
    // =========================================================

    // 6.1 構建用戶畫像描述
    let userProfileDesc = '【用戶狀態】：未登入/未知'
    if (userData) {
      userProfileDesc = `【用戶個人資料】
      - 年齡: ${userData.birthday ? new Date().getFullYear() - new Date(userData.birthday).getFullYear() : '未知'}
      - 性別: ${userData.gender || '未知'}
      - 身份標籤: ${userData.identities?.join(', ') || '無'}
      - NLU提取意圖: ${city || '無'}, ${identities.join(', ')}`
    }

    // 6.2 構建福利與匹配結果描述 (這是給 LLM 看的關鍵資訊)
    const welfareContext = enrichedWelfares.map((w, i) => {
      let matchDesc = ''

      // 描述個人的匹配狀況
      if (w.userMatch) {
        matchDesc += `\n   -> [個人適配度]: ${w.userMatch.light}燈 (原因: ${w.userMatch.reasons.join(', ')})`
      }

      // 描述家庭的匹配狀況
      if (w.familyMatches.length > 0) {
        const greenMembers = w.familyMatches.filter((m: any) => m.match.light === 'GREEN').map((m: any) => m.role)
        const redMembers = w.familyMatches.filter((m: any) => m.match.light === 'RED').map((m: any) => m.role)
        matchDesc += `\n   -> [家庭適配度]: 符合成員(${greenMembers.join(', ')}); 不符成員(${redMembers.join(', ')})`
      }

      return `[${i + 1}] 福利名稱: ${w.name}
   摘要: ${w.searchSnippet || w.summaryContent}
   ${matchDesc}`
    }).join('\n\n')


    // =========================================================
    // 7. 最終生成 (Generation)
    // =========================================================

    const finalPrompt = `
      你是一位熱心且專業的福利查詢小幫手，名字是「阿哞」。
      你的任務是根據提供的【參考福利資料】與【適配度分析】，回答用戶問題。

      回答原則：
      1. **結合適配度**：請優先推薦「綠燈」或「適配度高」的福利。如果用戶個人資料顯示「紅燈」，請委婉告知原因（例如年齡不符）。
      2. **家庭視角**：若有家庭適配資訊，請明確指出家中「誰」可以申請（例如：「這項補助爸爸可以申請，但媽媽因年齡不符無法申請」）。
      3. **簡潔明瞭**：回答字數維持在 150 字以內。
      4. **主動追問**：若資料不足（黃燈），請追問細節。
      5. **誠實**：若無相關資料，請告知。
    `

    const aiResponseText = await this.llmService.chat({
      provider: LlmProvider.GEMINI,
      systemPrompt: finalPrompt,
      userContent: `
      ${userProfileDesc}

      【參考福利資料 (含紅綠燈分析)】
      ${welfareContext}

      【歷史對話】
      ${historyContext}

      【用戶最新問題】
      ${userMessage}
      `,
    })

    // =========================================================
    // 8. 儲存與回傳 (Persistence)
    // =========================================================

    const savedAiMessage = await this.saveMessage(session.id, 'assistant', aiResponseText, {
      extractedCity: city,
      extractedIdentities: identities,
      ragSources: enrichedWelfares.map((w) => ({
        id: w.id,
        title: w.name,
        uri: w.sourceUrl,
        summaryContent: w.summaryContent,
        userMatch: w.userMatch,     // 前端可直接顯示個人燈號
        familyMatches: w.familyMatches // 前端可直接顯示家庭列表
      })),
    })

    return {
      sessionId: session.id,
      reply: aiResponseText,
      metadata: savedAiMessage.metadata,
    }
  }

  // --- 輔助方法 (保持不變) ---

  private async extractIntents(
    query: string,
    history: string,
  ): Promise<{ city: string | null; identities: string[] }> {
    const prompt = `
      分析以下對話與用戶最新問題，提取出用戶的「所在縣市(city)」與「身份關鍵字(identities)」。
      身份關鍵字列表參考: ["20歲以下", "20歲-65歲", "65歲以上", "男性", "女性", "中低收入戶", "低收入戶", "榮民", "身心障礙者", "原住民", "外籍配偶家庭"].

      請直接回傳 JSON 格式，不要有 markdown 標記:
      {
        "city": "台北市" (若無則 null),
        "identities": ["學生", "低收入戶"] (若無則 [])
      }
    `
    try {
      const jsonStr = await this.llmService.chat({
        provider: LlmProvider.GEMINI,
        systemPrompt: prompt,
        userContent: `
        歷史對話:
      ${history}

      最新問題:
      ${query}
      `,
      })
      const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(cleanJson)
    } catch (e) {
      this.logger.error(`NLU 提取失敗: ${e.message}`)
      return { city: null, identities: [] }
    }
  }

  private async saveMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    metadata?: any,
  ): Promise<ChatMessage> {
    const msg = this.messageRepository.create({
      sessionId,
      role,
      content,
      metadata,
    })
    return await this.messageRepository.save(msg)
  }
}
