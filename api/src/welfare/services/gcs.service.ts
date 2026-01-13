import { Storage } from "@google-cloud/storage"
import { Injectable, Logger } from "@nestjs/common"
import path from 'path'
import { Welfare } from '../entities/welfare.entity.js'

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);
  private readonly storage: Storage
  private readonly bucketName: string
  private readonly fileName: string

  constructor() {
    const keyFilePath = path.join(process.cwd(), 'service-account-key.json')

    this.storage = new Storage({
      keyFilename: keyFilePath
    })

    this.bucketName = process.env.GCS_BUCKET_NAME || "mouai_data"
    this.fileName = process.env.GCS_FILE_NAME || "welfare_data.jsonl"
  }

  onModuleInit() {
    this.logger.log('🚀 GcsService 已經初始化')
  }

  /** 把新資料 append 進 GCS 的 jsonl 檔案 */
  async appendAndUpload(records: Welfare[]): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName)
    const file = bucket.file(this.fileName)

    let existingContent = ""

    try {
      const [exists] = await file.exists()
      if (exists) {
        const [contents] = await file.download()
        existingContent = contents.toString("utf-8")
      }
    } catch (err) {
      this.logger.warn(`⚠️ 讀取 GCS 失敗（可能是首次建立）：${err.message}`)
    }

    // 把舊資料 + 新資料合併
    const lines: string[] = existingContent
      ? existingContent.trim().split("\n")
      : []

    for (const record of records) {
      lines.push(JSON.stringify(record))
    }

    const newContent = lines.join("\n") + "\n"

    await file.save(newContent, {
      contentType: "application/jsonl",
    })

    this.logger.log(
      `☁️ 已更新 GCS ${this.fileName}, 新增 ${records.length} 筆資料`
    )
  }
}
