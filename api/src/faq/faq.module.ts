import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Faq } from './entities/faq.entity.js'
import { FaqController } from './faq.controller.js'
import { FaqService } from './faq.service.js'

@Module({
  imports: [TypeOrmModule.forFeature([Faq])],
  controllers: [FaqController],
  providers: [FaqService],
  exports: [FaqService],
})
export class FaqModule { }
