import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LlmService } from '../llm/llm.service.js'
import { LlmProvider } from '../llm/llm.types.js'
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
    private readonly vertexAiProvider: VertexAiProvider,
    private readonly llmService: LlmService,
  ) { }

  async handleMessage(
    userId: string,
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

    // 2. 儲存用戶訊息 (Persistence)
    await this.saveMessage(session.id, 'user', userMessage)

    // 3. 讀取歷史訊息 (Context Window，例如取最近 5 則)
    const history = await this.messageRepository.find({
      where: { sessionId: session.id },
      order: { createdAt: 'DESC' },
      take: 5,
    })
    const historyContext = history.reverse().map(m => `${m.role}: ${m.content}`).join('\n')

    this.logger.log(`開始並行處理訊息 Session: ${session.id}`)

    // =========================================================
    // 4. 並行處理 (Parallel Execution)
    // =========================================================

    const [nluResult, ragDocuments] = await Promise.all([
      // 任務 A: NLU 意圖識別 (Extraction)
      this.extractIntents(userMessage, historyContext),

      // 任務 B: RAG 檢索 (Retrieval)
      this.vertexAiProvider.searchWelfareDocs(userMessage),
    ])

    const { city, identities } = nluResult
    this.logger.log(`NLU 提取結果: City=${city}, Identities=${identities}`)
    this.logger.log(`Vertex Search 找到 ${ragDocuments.length} 筆資料`)

    // =========================================================
    // 5. 資料收斂與核對 (Convergence & Verification)
    // =========================================================

    // 過濾邏輯：如果 LLM 提取出了特定縣市，我們就過濾掉明顯不符的文件
    // (前提：Vertex Search 的 snippet 或 metadata 包含縣市資訊，或者依靠 Gemini 第二階段過濾)
    // 這裡示範「軟過濾」：我們把提取出的資訊加到 Prompt 裡，要求 LLM 做嚴格比對

    const validDocs = ragDocuments.map((d, index) => {
      return `${index + 1}: ${d.title}`
    })
    // =========================================================
    // 6. 最終生成 (Generation)
    // =========================================================

    const finalPrompt = `
          你是一位熱心且專業的福利查詢小幫手，名字是「阿哞」。

    你的任務是根據所提供的資料庫內容，為使用者提供政府福利相關的資訊。

    回答原則：
    1. 回答內容必須嚴格基於所提供的資料庫。
    2. 清楚說明福利的名稱和相關內容，並以專業、熱心的口吻回答。
    3. 每個回答的字數必須維持在 100 字以內，並力求簡潔明瞭。
    4. 當使用者提供的資料不明確或不夠完整時，在回應的最後持續追問更多資訊，例如「請問您是哪個縣市的居民呢？」或「您方便提供更具體的資料嗎？」，以幫助使用者找到適合自己的福利。
    5. 如果資料庫中找不到使用者提問的資訊，請禮貌地告知使用者目前無法提供相關資訊，並避免編造或猜測答案。
    `

    const aiResponseText = await this.llmService.chat({
      provider: LlmProvider.GEMINI,
      systemPrompt: finalPrompt,
      userContent: `
        【用戶資訊】
      - 所在縣市: ${city || '未知'}
      - 具備身份: ${identities.length > 0 ? identities.join(', ') : '未知'}

      【參考資料 (RAG)】
      ${validDocs}

      【歷史對話】
      ${historyContext}

      【用戶最新問題】
      ${userMessage}
      `
    })

    // 7. 儲存 AI 回答與 Metadata (Persistence)
    const savedAiMessage = await this.saveMessage(session.id, 'assistant', aiResponseText, {
      extractedCity: city,
      extractedIdentities: identities,
      ragSources: validDocs.map(d => ({ title: d, uri: d, snippet: d }))
    })

    return {
      sessionId: session.id,
      reply: aiResponseText,
      metadata: savedAiMessage.metadata
    }
  }

  // --- 輔助方法 ---

  private async extractIntents(query: string, history: string): Promise<{ city: string | null; identities: string[] }> {
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
      `
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
    metadata?: any
  ): Promise<ChatMessage> {
    const msg = this.messageRepository.create({
      sessionId,
      role,
      content,
      metadata
    })
    return await this.messageRepository.save(msg)
  }
}
