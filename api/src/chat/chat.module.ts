import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatController } from './chat.controller.js'
import { ChatService } from './chat.service.js'
import { ChatMessage } from './entities/chat-message.entity.js'
import { ChatSession } from './entities/chat-session.entity.js'
import { VertexAiProvider } from './providers/vertex-ai.provider.js'

@Module({
  imports: [TypeOrmModule.forFeature([ChatSession, ChatMessage])],
  providers: [VertexAiProvider, ChatService],
  controllers: [ChatController]
})
export class ChatModule { }
