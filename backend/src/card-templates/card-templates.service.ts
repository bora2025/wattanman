import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CardTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cardTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { name: string; cardType: string; design: object }) {
    return this.prisma.cardTemplate.create({
      data: {
        name: data.name,
        cardType: data.cardType,
        design: data.design,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.cardTemplate.delete({ where: { id } });
  }
}
