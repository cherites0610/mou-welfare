import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
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
  ) {
    return this.chatService.handleMessage(dto.userId ?? null, dto.familyId, dto.sessionId || null, dto.message, dto.autoApplyProfile ?? true, dto.generateMarkdown ?? true)
  }

  @Get()
  @ApiOperation({ summary: '取得當前用戶的所有對話紀錄' })
  async getSessions(@CurrentUser() user: User) {
    return this.chatService.getUserSessions(user.id)
  }

  @Get('sessions/:sessionId/messages')
  @ApiOperation({ summary: '取得特定對話的所有訊息' })
  async getSessionMessages(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.chatService.getSessionMessages(sessionId)
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: '刪除特定對話紀錄' })
  async deleteSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.chatService.deleteSession(sessionId)
  }
}
