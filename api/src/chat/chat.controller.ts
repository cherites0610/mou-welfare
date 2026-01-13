import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js'
import { ChatService } from './chat.service.js'
import { SendMessageDto } from './dtos/send-message.dto.js'

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Post()
  @ApiOperation({ summary: '發送訊息給 AI (RAG + NLU)' })
  async sendMessage(
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.handleMessage(dto.userId ?? null, dto.familyId, dto.sessionId || null, dto.message)
  }
}
