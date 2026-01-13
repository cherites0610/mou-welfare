import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { AppModule } from './app.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))

  const configService = app.get(ConfigService)
  const port = configService.get<number>('PORT') || 3000

  app.enableCors()

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )

  const config = new DocumentBuilder()
    .setTitle('哞福利 API')
    .setDescription('哞福利系統 API 文件')
    .addBearerAuth()
    .addServer('v1')
    .setVersion('1.0')
    .build()

  const document = SwaggerModule.createDocument(app, config)

  // 設定 Swagger 路由為 /api/docs
  SwaggerModule.setup('api/docs', app, document)

  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())

  app.setGlobalPrefix('api/v1')

  await app.listen(port)

  console.log(`Application is running on: ${await app.getUrl()}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
}
bootstrap()
