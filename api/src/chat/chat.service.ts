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
import { ChatMessage, MessageRole, WelfareCategory } from './entities/chat-message.entity.js'
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
    autoApplyProfile: boolean = true,
    generateMarkdown: boolean = true,
  ) {
    // 1. 確保 Session 存在或建立新 Session
    let session: ChatSession | null
    if (sessionId) {
      session = await this.sessionRepository.findOne({ where: { id: sessionId } })
      if (!session) throw new NotFoundException('Session not found')
    } else {
      session = this.sessionRepository.create({ userId, title: userMessage.slice(0, 20), autoApplyProfile, generateMarkdown })
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
      // Task 1: 撈取個人資料 (若有 userId 且 session 啟用自動套用)
      session.autoApplyProfile && userId ? this.userRepository.findOne({ where: { id: userId } }) : null,

      // Task 2: 撈取家庭成員 (若有 familyId 且 session 啟用自動套用)
      session.autoApplyProfile && familyId
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

    // NLU 結果優先，若為空且 autoApplyProfile 啟用，則由 profile 補齊
    const city = nluResult.city ?? (session.autoApplyProfile ? (userData?.city ?? null) : null)
    const identities = nluResult.identities.length > 0
      ? nluResult.identities
      : (session.autoApplyProfile ? (userData?.identities ?? []) : [])
    const { category } = nluResult

    const isConverged = !!city && identities.length > 0 && !!category
    this.logger.log(`NLU 提取結果: City=${city}, Identities=${identities}, Category=${category}, Converged=${isConverged}`)
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
            .map((member: UserFamily) => {
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
      - 城市: ${userData.city || '未知'}
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

      你會收到：
      - 【用戶個人資料】：用戶的基本資料與 NLU 提取的意圖
      - 【背景福利資料 (含紅綠燈分析)】：系統預先檢索的相關福利，僅供你內部推理，嚴禁直接引用
      - 【歷史對話】與【用戶最新問題】

      ════════════════════════════════
      ★ 核心判斷：問題是否已「收斂」？
      ════════════════════════════════
      收斂條件：用戶的需求同時涵蓋以下三點（寬鬆認定，見下方說明）
        A. 大致知道「縣市」
        B. 大致知道「身份類別」—— 系統支援的身份標籤：
           20歲以下 / 20歲-65歲 / 65歲以上 / 男性 / 女性 /
           中低收入戶 / 低收入戶 / 榮民 / 身心障礙者 / 原住民 / 外籍配偶家庭
        C. 大致知道「福利種類」—— 系統支援的種類：
           兒童及青少年福利 / 婦女與幼兒福利 / 老人福利 /
           社會救助福利 / 身心障礙福利 / 其他福利

      ⚠️ 寬鬆認定原則（重要）：
      - 【用戶個人資料】中已有的縣市、身份標籤，直接視為條件 A、B 已滿足，絕對不可再詢問
      - 不要要求用戶提供「證明文件」或「精確資格」，只要用戶自述即可接受
        ✓ 「我是身心障礙者」→ 視為已知身份，不需追問是否持有手冊
        ✓ 「我媽媽是老人」→ 視為已知身份（65歲以上），受惠對象是媽媽
        ✓ 「想了解長照補助」→ 可自行推斷身份（65歲以上）與福利種類（老人福利）
      - 若能從上下文合理推斷，不必再追問
      - 只有在「完全無從判斷」時才追問，每次只問一個問題

      【未收斂時的行為】
      - 絕對不可列出、引用或提及任何具體福利名稱、補助金額或申請條件
      - 可以用【背景福利資料】悄悄推斷用戶可能需要哪方面資訊，從而提出更精準的追問
      - 追問時，將上方的「身份標籤」或「福利種類」選項以自然口語融入問句，
        引導用戶選擇系統可識別的答案，例如：
        「請問是為長輩（65歲以上）、還是小朋友查詢呢？」
        「您想了解的是老人福利、身心障礙福利，還是其他類型？」
      - 語氣像朋友聊天而非制式問卷，不要直接列出選項清單

      【收斂後的行為】
      - 根據【背景福利資料】中的紅綠燈分析，優先推薦綠燈福利
      - 若個人資料顯示紅燈，委婉說明原因（例如：年齡不符）
      - 若有家庭適配資訊，明確指出家中「誰」可以申請
      - 若背景資料中無完全符合的項目，如實告知，不要捏造

      ════════════════════════════════
      通用原則
      ════════════════════════════════
      - 回答字數維持在 150 字以內
      - 輸出格式：${session.generateMarkdown ? '使用 Markdown 格式（標題、粗體、列表等）' : '純文字，不使用任何 Markdown 語法'}
    `

    console.log("=== LLM 最終 Prompt ===")
    console.log(`
      ${userProfileDesc}

      【背景福利資料 (含紅綠燈分析，僅供內部推理，禁止直接引用)】
      ${welfareContext}

      【歷史對話】
      ${historyContext}

      【用戶最新問題】
      ${userMessage}
      `)

    const aiResponseText = await this.llmService.chat({
      provider: LlmProvider.GEMINI,
      systemPrompt: finalPrompt,
      userContent: `
      ${userProfileDesc}

      【背景福利資料 (含紅綠燈分析，僅供內部推理，禁止直接引用)】
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
      extractedCategory: category,
      isConverged,
      ragSources: enrichedWelfares.map((w) => ({
        id: w.id,
        name: w.name,
        sourceCity: w.sourceCity,
        sourceUrl: w.sourceUrl,
        categories: w.categories,
        requirements: w.requirements,
        identity: w.identity,
        rewards: w.rewards,
        originalName: w.originalName,
        originalContent: w.originalContent,
        summaryContent: w.summaryContent,
        publishDate: w.publishDate,
        deadline: w.deadline,
        match: w.userMatch,
        familyMatches: w.familyMatches,
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
  ): Promise<{ city: string | null; identities: string[]; category: WelfareCategory | null }> {
    const prompt = `
      分析以下對話與用戶最新問題，提取出三項資訊：
      1. 所在縣市 (city)
      2. 身份關鍵字 (identities)：從以下列表選取，可多選
         ["20歲以下", "20歲-65歲", "65歲以上", "男性", "女性", "中低收入戶", "低收入戶", "榮民", "身心障礙者", "原住民", "外籍配偶家庭"]
      3. 福利種類 (category)：從以下列表選取最符合的一項，無法判斷則為 null
         ["兒童及青少年福利", "婦女與幼兒福利", "老人福利", "社會救助福利", "身心障礙福利", "其他福利"]

      請直接回傳 JSON 格式，不要有 markdown 標記:
      {
        "city": "台北市",
        "identities": ["低收入戶"],
        "category": "社會救助福利"
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
      return { city: null, identities: [], category: null }
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
