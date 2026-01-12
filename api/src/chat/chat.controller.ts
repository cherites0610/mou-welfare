import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { User } from '../user/entities/user.entity.js'
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
    @CurrentUser() user: User,
  ) {
    return this.chatService.handleMessage(user.id, dto.sessionId || null, dto.message)
  }
}
