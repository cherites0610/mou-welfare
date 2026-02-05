import { Storage } from '@google-cloud/storage'
import { Injectable } from '@nestjs/common'
import { extname } from 'path'

@Injectable()
export class AppService {
  private storage: Storage
  private bucketName = 'mou-welfare';

  constructor() {
    this.storage = new Storage({
      keyFilename: 'service-account-key.json',
      projectId: 'welfare-462510',
    })
  }

  getHello(): string {
    return 'Hello World!'
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const fileName = `${Date.now()}${extname(file.originalname)}`
    const bucket = this.storage.bucket(this.bucketName)
    const blob = bucket.file(fileName)

    await blob.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
    })

    return `https://storage.googleapis.com/${this.bucketName}/${fileName}`
  }
}
