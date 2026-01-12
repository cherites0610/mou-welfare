import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Family } from './entities/family.entity.js'
import { FamiliesController } from './family.controller.js'
import { FamiliesService } from './family.service.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([Family]),
  ],
  controllers: [FamiliesController],
  providers: [FamiliesService],
})
export class FmailyModule { }
