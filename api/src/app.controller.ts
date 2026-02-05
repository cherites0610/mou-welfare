import { Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppService } from './app.service.js'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('health-check')
  getHello(): string {
    return this.appService.getHello()
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const url = await this.appService.uploadImage(file)
    return { url }
  }
}
