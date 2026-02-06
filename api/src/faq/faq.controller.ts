import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CreateFaqDto } from './dtos/create-faq.dto.js'
import { UpdateFaqDto } from './dtos/update-faq.dto.js'
import { Faq } from './entities/faq.entity.js'
import { FaqService } from './faq.service.js'

@ApiTags('FAQ')
@Controller('faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) { }

  @Post()
  @ApiOperation({ summary: 'Create FAQ' })
  @ApiResponse({ status: 201, type: Faq })
  create(@Headers('x-api-key') apikey: string, @Body() createFaqDto: CreateFaqDto) {
    if (apikey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key')
    }

    return this.faqService.create(createFaqDto)
  }

  @Get()
  @ApiOperation({ summary: 'Get all FAQs' })
  @ApiResponse({ status: 200, type: [Faq] })
  findAll() {
    return this.faqService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get FAQ by ID' })
  @ApiResponse({ status: 200, type: Faq })
  findOne(@Param('id') id: string) {
    return this.faqService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update FAQ' })
  @ApiResponse({ status: 200, type: Faq })
  update(@Headers('x-api-key') apikey: string, @Param('id') id: string, @Body() updateFaqDto: UpdateFaqDto) {
    if (apikey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key')
    }
    return this.faqService.update(id, updateFaqDto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete FAQ' })
  @ApiResponse({ status: 200 })
  remove(@Headers('x-api-key') apikey: string, @Param('id') id: string) {
    if (apikey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key')
    }
    return this.faqService.remove(id)
  }
}
