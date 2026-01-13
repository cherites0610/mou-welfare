import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { GoogleAuth } from 'google-auth-library'
import * as path from 'path'
import { Welfare } from '../../welfare/entities/welfare.entity.js'

@Injectable()
export class VertexAiProvider {
  private readonly logger = new Logger(VertexAiProvider.name)
  private readonly projectId: string
  private readonly engineId: string
  private readonly auth: GoogleAuth

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.projectId = this.configService.getOrThrow<string>('GOOGLE_PROJECT_ID')
    this.engineId = this.configService.getOrThrow<string>('VERTEX_DATA_STORE_ID')

    const keyFilePath = path.join(process.cwd(), 'service-account-key.json')

    this.auth = new GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient()
    const accessToken = await client.getAccessToken()
    return accessToken.token || ''
  }

  async searchWelfareDocs(query: string): Promise<Welfare[]> {
    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${this.projectId}/locations/global/collections/default_collection/engines/${this.engineId}/servingConfigs/default_search:search`

    this.logger.log(`正在執行 Vertex Search (REST): ${query}`)

    try {
      const token = await this.getAccessToken()

      const payload = {
        query: query,
        pageSize: 5,
        queryExpansionSpec: { condition: "AUTO" },
        spellCorrectionSpec: { mode: "AUTO" },
        languageCode: "zh-TW",
        userInfo: { timeZone: "Asia/Taipei" },
        contentSearchSpec: {
          snippetSpec: { returnSnippet: true },
          // summarySpec: { summaryResultCount: 5, includeCitations: true }
        }
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const results = response.data.results || []

      return results.map((r: any): Welfare => {

        return {
          id: r.document?.structData?.id || r.document?.id,
          name: r.document?.structData?.title || r.document?.displayName,
          summaryContent: r.document?.structData?.summary || r.document?.snippet,
          originalContent: r.document?.structData?.detail,
          rewards: r.document?.structData?.forward,
          sourceUrl: r.document?.structData?.link,
          sourceCity: r.document?.structData?.location,
          publishDate: r.document?.structData?.publicationDate,
          categories: r.document?.structData?.categories,
          requirements: r.document?.structData?.applicationCriteria,
          identity: [""],
          originalName: "",
        } as Welfare
      })

    } catch (error) {
      this.logger.error(`Vertex Search 失敗: ${error.response?.data?.error?.message || error.message}`)
      return []
    }
  }
}
