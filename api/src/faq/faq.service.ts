import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateFaqDto } from './dtos/create-faq.dto.js'
import { UpdateFaqDto } from './dtos/update-faq.dto.js'
import { Faq } from './entities/faq.entity.js'

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepository: Repository<Faq>,
  ) { }

  async create(createFaqDto: CreateFaqDto): Promise<Faq> {
    const faq = this.faqRepository.create(createFaqDto)
    return await this.faqRepository.save(faq)
  }

  async findAll(): Promise<Faq[]> {
    return await this.faqRepository.find({
      order: {
        order_index: 'ASC',
      },
    })
  }

  async findOne(id: string): Promise<Faq> {
    const faq = await this.faqRepository.findOne({ where: { id } })
    if (!faq) {
      throw new NotFoundException()
    }
    return faq
  }

  async update(id: string, updateFaqDto: UpdateFaqDto): Promise<Faq> {
    const faq = await this.findOne(id)
    Object.assign(faq, updateFaqDto)
    return await this.faqRepository.save(faq)
  }

  async remove(id: string): Promise<void> {
    const result = await this.faqRepository.delete(id)
    if (result.affected === 0) {
      throw new NotFoundException()
    }
  }
}
