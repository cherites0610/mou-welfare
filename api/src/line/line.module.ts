import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatModule } from '../chat/chat.module.js'
import { ChatSession } from '../chat/entities/chat-session.entity.js'
import { User } from '../user/entities/user.entity.js'
import { WelfaresModule } from '../welfare/welfare.module.js'
import { LineController } from './line.controller.js'
import { LineService } from './line.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([User, ChatSession]), ChatModule, WelfaresModule],
  controllers: [LineController],
  providers: [LineService],
})
export class LineModule { }
