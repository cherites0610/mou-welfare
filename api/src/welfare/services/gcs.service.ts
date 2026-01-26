import { Storage } from "@google-cloud/storage"
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import path from 'path'
import { Welfare } from '../entities/welfare.entity.js'

@Injectable()
export class GcsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GcsService.name)
  private readonly storage: Storage
  private readonly bucketName: string
  private readonly fileName: string

  private buffer: Welfare[] = []
  private readonly BATCH_SIZE = 50
  private readonly FLUSH_INTERVAL = 60000
  private flushTimer: NodeJS.Timeout | null = null

  constructor() {
    const keyFilePath = path.join(process.cwd(), 'service-account-key.json')
    this.storage = new Storage({ keyFilename: keyFilePath })
    this.bucketName = process.env.GCS_BUCKET_NAME || "mouai_data"
    this.fileName = process.env.GCS_FILE_NAME || "welfare_data.jsonl"
  }

  onModuleInit() {
    this.logger.log('🚀 GcsService Batch Mode Initialized')
    this.startFlushTimer()
  }

  async onModuleDestroy() {
    this.logger.log('🛑 Application shutting down, flushing remaining data...')
    if (this.flushTimer) clearInterval(this.flushTimer)
    await this.flush()
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.FLUSH_INTERVAL)
  }

  addToBuffer(welfare: Welfare) {
    this.buffer.push(welfare)
    if (this.buffer.length >= this.BATCH_SIZE) {
      void this.flush()
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return

    const recordsToUpload = [...this.buffer]
    this.buffer = []

    this.logger.log(`⏳ Flushing ${recordsToUpload.length} records to GCS...`)
    await this.appendAndUpload(recordsToUpload)
  }

  private async appendAndUpload(records: Welfare[]): Promise<void> {
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
      this.logger.warn(`⚠️ GCS Read Error: ${err.message}`)
    }

    const lines: string[] = existingContent
      ? existingContent.trim().split("\n")
      : []

    for (const record of records) {
      lines.push(JSON.stringify(record))
    }

    const newContent = lines.join("\n") + "\n"

    await file.save(newContent, {
      contentType: "application/jsonl",
      resumable: false
    })

    this.logger.log(`☁️ GCS Updated. Added ${records.length} records.`)
  }

  async removeByCity(city: string): Promise<void> {
    await this.flush()

    const bucket = this.storage.bucket(this.bucketName)
    const file = bucket.file(this.fileName)

    const [exists] = await file.exists()
    if (!exists) return

    const [contents] = await file.download()
    const contentStr = contents.toString("utf-8")

    if (!contentStr.trim()) return

    const lines = contentStr.trim().split("\n")

    const filteredLines = lines.filter(line => {
      try {
        const record = JSON.parse(line) as Welfare
        return record.sourceCity !== city
      } catch {
        return false
      }
    })

    const removeCount = lines.length - filteredLines.length

    if (removeCount === 0) {
      this.logger.log(`No records found for city: ${city} in GCS`)
      return
    }

    const newContent = filteredLines.length > 0
      ? filteredLines.join("\n") + "\n"
      : ""

    await file.save(newContent, {
      contentType: "application/jsonl",
      resumable: false
    })

    this.logger.log(`🗑️ Removed ${removeCount} records for city: ${city} from GCS`)
  }
}
