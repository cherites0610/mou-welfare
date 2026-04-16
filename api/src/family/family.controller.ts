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
import { CreateFamilyDto } from './dtos/create-family.dto.js'
import { UpdateFamilyDto } from './dtos/update-family.dto.js'
import { Family } from './entities/family.entity.js'
import { FamiliesService } from './family.service.js'

@ApiTags('Families')
@Controller('families')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FamiliesController {
  private readonly logger = new Logger(FamiliesController.name)

  constructor(private readonly familiesService: FamiliesService) { }

  @Post()
  @ApiOperation({ summary: '建立新家庭 (自動加入為管理員)' })
  async create(
    @Body() createFamilyDto: CreateFamilyDto,
    @CurrentUser() user: User, // 👈 取得當前登入用戶
  ): Promise<Family> {
    this.logger.log(`收到建立家庭請求: ${createFamilyDto.name}, User ID: ${user.id}`)
    return this.familiesService.create(createFamilyDto, user)
  }

  @Get()
  @ApiOperation({ summary: '取得所有家庭列表' })
  async findAll(@CurrentUser() user: User): Promise<Family[]> {
    // this.logger.log(`查詢所有家庭列表請求, User ID: ${user.id}`)
    return this.familiesService.findAll(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: '取得指定家庭詳情' })
  async findOne(
    @Param('id') id: string,
  ): Promise<Family> {
    this.logger.log(`查詢指定家庭 ID: ${id}`)
    return this.familiesService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新家庭資料' })
  async update(
    @Param('id') id: string,
    @Body() updateFamilyDto: UpdateFamilyDto,
    @CurrentUser() user: User,
  ): Promise<Family> {
    this.logger.log(`收到更新家庭請求 ID: ${id}, User ID: ${user.id}`)
    return this.familiesService.update(id, updateFamilyDto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '刪除家庭' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    this.logger.log(`收到刪除家庭請求 ID: ${id}, User ID: ${user.id}`)
    return this.familiesService.remove(id)
  }
}
