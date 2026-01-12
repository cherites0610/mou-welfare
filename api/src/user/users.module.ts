import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Welfare } from '../welfare/entities/welfare.entity.js'
import { User } from './entities/user.entity.js'
import { UsersController } from './user.controller.js'
import { UsersService } from './users.service.js'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Welfare]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
