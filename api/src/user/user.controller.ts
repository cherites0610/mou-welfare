import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { AddFavoriteDto } from './dtos/add-favorite.dto.js'
import { UpdateUserDto } from './dtos/update-user.dto.js'
import { User } from './entities/user.entity.js'
import { UsersService } from './users.service.js'

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard) // 全域套用 Guard，因為以下所有操作都需要登入
@ApiBearerAuth()
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly usersService: UsersService) { }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取得個人資料' })
  async getProfile(@CurrentUser() user: User) {
    this.logger.log(`收到取得個人資料請求 User ID: ${user.id}`)
    // 注意：CurrentUser 裝飾器通常是從 Request 解析出來的，資料可能不完整
    // 建議重新查詢一次 DB 以確保資料最新
    return this.usersService.findOneById(user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改個人資料' })
  async updateProfile(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ): Promise<User> {
    this.logger.log(`收到更新資料請求 Target ID: ${id}, Request User ID: ${user.id}`)

    if (id !== user.id) {
      this.logger.warn(`權限不足：用戶 ${user.id} 嘗試修改用戶 ${id} 的資料`)
      throw new ForbiddenException('你只能修改自己的資料')
    }

    return this.usersService.update(id, updateUserDto)
  }

  // --- 收藏功能 ---

  @Post('favorites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '加入收藏福利' })
  async addFavorite(
    @Body() dto: AddFavoriteDto,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.usersService.addFavorite(user.id, dto.welfareId)
    return { message: '已加入收藏' }
  }

  @Delete('favorites/:welfareId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移除收藏福利' })
  async removeFavorite(
    @Param('welfareId') welfareId: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.usersService.removeFavorite(user.id, welfareId)
    return { message: '已移除收藏' }
  }

  @Get('favorites')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取得我的收藏列表' })
  async getFavorites(@CurrentUser() user: User): Promise<Welfare[]> {
    return this.usersService.getFavorites(user.id)
  }
}
