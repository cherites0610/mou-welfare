import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { User } from '../user/entities/user.entity.js'
import { CreateUserFamilyDto } from './dtos/create-user-family.dto.js'
import { JoinFamilyDto } from './dtos/join-family.dto.js'
import { UpdateUserFamilyDto } from './dtos/update-user-family.dto.js'
import { UserFamily } from './entities/user-family.entity.js'
import { UserFamiliesService } from './user-families.service.js'

@ApiTags('UserFamilies')
@Controller('user-families')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserFamiliesController {
  private readonly logger = new Logger(UserFamiliesController.name)

  constructor(private readonly userFamiliesService: UserFamiliesService) { }

  @Post()
  @ApiOperation({ summary: '新增家庭成員 (直接指定)' })
  async addMember(@Body() dto: CreateUserFamilyDto): Promise<UserFamily> {
    this.logger.log(`收到新增成員請求: Family ${dto.familyId}, User ${dto.userId}`)
    return this.userFamiliesService.addMember(dto)
  }

  @Get('family/:familyId')
  @ApiOperation({ summary: '查詢特定家庭的所有成員' })
  async findByFamilyId(
    @Param('familyId') familyId: string, @CurrentUser() user: User
  ): Promise<UserFamily[]> {
    this.logger.log(`收到查詢成員請求 Family ID: ${familyId}`)
    return this.userFamiliesService.findByFamilyId(familyId, user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改成員身份 (Role)' })
  async updateMemberRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserFamilyDto,
    @CurrentUser() user: User
  ): Promise<UserFamily> {
    this.logger.log(`收到更新成員身份請求 ID: ${id}, New Role: ${dto.role}`)
    return this.userFamiliesService.updateMemberRole(id, dto, user.id)
  }

  @Delete(':id')
  @ApiOperation({ summary: '移除家庭成員' })
  async removeMember(@Param('id') id: string, @CurrentUser() user: User): Promise<void> {
    this.logger.log(`收到移除成員請求 ID: ${id}`)
    return this.userFamiliesService.removeMember(id, user.id)
  }

  @Post('invite-code')
  @ApiOperation({ summary: '生成加入家庭的邀請碼' })
  async generateInviteCode(
    @Body('familyId') familyId: string,
    @CurrentUser() user: User,
  ): Promise<{ code: string; expiresIn: number }> {
    this.logger.log(`收到生成邀請碼請求: Family ${familyId}, Requester User ID: ${user.id}`)
    return this.userFamiliesService.generateInviteCode(familyId, user.id)
  }

  @Post('join')
  @ApiOperation({ summary: '透過邀請碼加入家庭' })
  async joinByCode(
    @Body() joinFamilyDto: JoinFamilyDto,
    @CurrentUser() user: User,
  ): Promise<UserFamily> {
    this.logger.log(`收到代碼加入請求: User ID: ${user.id}`)
    return this.userFamiliesService.joinByCode(joinFamilyDto.code, user.id)
  }
}
