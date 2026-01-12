import { HttpModule } from '@nestjs/axios'
import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationLog } from './entities/notification-log.entity.js'
import { NotificationsProcessor } from './notifications.processor.js'
import { NotificationsService } from './notifications.service.js'
import { EmailProvider } from './providers/email.provider.js'
import { LineProvider } from './providers/line.provider.js'
import { TemplateService } from './template.service.js'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    HttpModule,
    BullModule.registerQueue({
      name: 'notifications',
    }),
    ConfigModule,
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    TemplateService,
    EmailProvider,
    LineProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule { }
