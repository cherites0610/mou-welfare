import { Body, Controller, Headers, Logger, Post, UnauthorizedException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IngestWelfareDto } from './dtos/ingest-welfare.dto.js'
import { SearchWelfareDto } from './dtos/search-welfare.dto.js'
import { WelfaresService } from './welfare.service.js'

@ApiTags('Welfares')
@Controller('welfare')
export class WelfaresController {
  private readonly logger = new Logger(WelfaresController.name)

  constructor(
    private readonly welfaresService: WelfaresService,
  ) { }

  @Post('ingest')
  @ApiOperation({ summary: '接收外部爬蟲福利資料 (推入佇列)' })
  async ingest(@Headers('x-api-key') apikey: string, @Body() dto: IngestWelfareDto) {
    if (apikey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key')
    }

    this.logger.log(`收到外部福利資料推送: ${dto.originalName}`)
    return this.welfaresService.ingest(dto)
  }

  @Post()
  @ApiOperation({ summary: '查詢福利資料' })
  async findAll(@Body() dto: SearchWelfareDto) {
    return this.welfaresService.search(dto)
  }
}
