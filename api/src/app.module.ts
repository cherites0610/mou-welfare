import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WinstonModule } from 'nest-winston'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { AuthModule } from './auth/auth.module.js'
import { ChatModule } from './chat/chat.module.js'
import { winstonConfig } from './config/winston.config.js'
import { FmailyModule } from './family/family.module.js'
import { LineModule } from './line/line.module.js'
import { NotificationsModule } from './notification/notifications.module.js'
import { RedisModule } from './redis/redis.module.js'
import { UserFamiliesModule } from './user-family/user-family.module.js'
import { UsersModule } from './user/users.module.js'
import { WelfaresModule } from './welfare/welfare.module.js'


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env'
      ],
    }),
    WinstonModule.forRoot(winstonConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('DB_SYNC') === 'true',
      }),
    }),
    RedisModule,
    NotificationsModule,
    UsersModule,
    WelfaresModule,
    AuthModule,
    FmailyModule,
    UserFamiliesModule,
    ChatModule,
    LineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
