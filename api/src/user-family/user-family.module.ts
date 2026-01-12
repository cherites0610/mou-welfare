import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Family } from '../family/entities/family.entity.js'
import { UserFamily } from './entities/user-family.entity.js'
import { UserFamiliesController } from './user-families.controller.js'
import { UserFamiliesService } from './user-families.service.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserFamily, Family])
  ],
  controllers: [UserFamiliesController],
  providers: [UserFamiliesService],
})
export class UserFamiliesModule { }
