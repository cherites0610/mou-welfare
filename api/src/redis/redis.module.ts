import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'

export const REDIS_CLIENT = 'REDIS_CLIENT'


@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisOptions: any = {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          db: configService.get<number>('REDIS_DB'),
          maxRetriesPerRequest: 3,
        }

        const username = configService.get<string>('REDIS_USERNAME')
        const password = configService.get<string>('REDIS_PASSWORD')

        if (username) redisOptions.username = username
        if (password) redisOptions.password = password

        return new Redis(redisOptions)
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule { }
