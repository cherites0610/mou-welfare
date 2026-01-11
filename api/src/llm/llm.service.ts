import { HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import CircuitBreaker from 'opossum'
import { ChatRequest, LlmConfig, LlmProvider } from './llm.types.js'

@Injectable()
export class LlmService implements OnModuleInit {
  private clients: Map<LlmProvider, OpenAI> = new Map();
  private breakers: Map<LlmProvider, CircuitBreaker> = new Map();

  constructor(private readonly configService: ConfigService) { }

  onModuleInit() {
    this.initializeProvider(LlmProvider.OPENAI, {
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
      model: 'gpt-4o',
    })

    this.initializeProvider(LlmProvider.GEMINI, {
      apiKey: this.configService.getOrThrow('GEMINI_API_KEY'),
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'gemini-1.5-flash',
    })

    this.initializeProvider(LlmProvider.QWEN, {
      apiKey: this.configService.getOrThrow('QWEN_API_KEY'),
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    })
  }

  private initializeProvider(provider: LlmProvider, config: LlmConfig) {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
    this.clients.set(provider, client)

    const breaker = new CircuitBreaker(
      async (messages: any[]) => {
        return await client.chat.completions.create({
          model: config.model,
          messages: messages,
        })
      },
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
      }
    )

    breaker.fallback(() => {
      throw new HttpException(
        `Service ${provider} is currently unavailable (Circuit Open)`,
        HttpStatus.SERVICE_UNAVAILABLE
      )
    })

    this.breakers.set(provider, breaker)
  }

  async chat(request: ChatRequest): Promise<string> {
    const { provider, systemPrompt, userContent } = request
    const breaker = this.breakers.get(provider)

    if (!breaker) {
      throw new Error(`Provider ${provider} not configured`)
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]

    try {
      const response: any = await breaker.fire(messages)
      return response.choices[0]?.message?.content || ''
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
