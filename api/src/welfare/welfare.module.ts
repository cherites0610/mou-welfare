import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LlmModule } from '../llm/llm.module.js'
import { UserFamily } from '../user-family/entities/user-family.entity.js'
import { User } from '../user/entities/user.entity.js'
import { Welfare } from './entities/welfare.entity.js'
import { WelfareLlmService } from './services/welfare-llm.service.js'
import { WelfareMatchingService } from './services/welfare-matching.service.js'
import { WelfaresProcessor } from './services/welfare.processor.js'
import { WelfaresController } from './welfare.controller.js'
import { WelfaresService } from './welfare.service.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([Welfare, User, UserFamily]),
    BullModule.registerQueue({
      name: 'welfare-processing',
    }),
    LlmModule
  ],
  controllers: [WelfaresController],
  providers: [
    WelfaresService,
    WelfaresProcessor,
    WelfareLlmService,
    WelfareMatchingService
  ],
  exports: [WelfaresService],
})
export class WelfaresModule { }
