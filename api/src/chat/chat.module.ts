import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserFamily } from '../user-family/entities/user-family.entity.js'
import { User } from '../user/entities/user.entity.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { WelfaresModule } from '../welfare/welfare.module.js'
import { ChatController } from './chat.controller.js'
import { ChatService } from './chat.service.js'
import { ChatMessage } from './entities/chat-message.entity.js'
import { ChatSession } from './entities/chat-session.entity.js'
import { VertexAiProvider } from './providers/vertex-ai.provider.js'

@Module({
  imports: [TypeOrmModule.forFeature([ChatSession, ChatMessage, Welfare, User, UserFamily]), WelfaresModule],
  providers: [VertexAiProvider, ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule { }
