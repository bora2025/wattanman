import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const ACTIVE_DESIGN_NAME = '__active__';

@Injectable()
export class CardTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cardTemplate.findMany({
      where: { NOT: { name: ACTIVE_DESIGN_NAME } },
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

  async getActiveDesign(cardType: string) {
    return this.prisma.cardTemplate.findFirst({
      where: { name: ACTIVE_DESIGN_NAME, cardType },
    });
  }

  async setActiveDesign(cardType: string, design: object) {
    const existing = await this.prisma.cardTemplate.findFirst({
      where: { name: ACTIVE_DESIGN_NAME, cardType },
    });
    if (existing) {
      return this.prisma.cardTemplate.update({
        where: { id: existing.id },
        data: { design },
      });
    }
    return this.prisma.cardTemplate.create({
      data: { name: ACTIVE_DESIGN_NAME, cardType, design },
    });
  }
}
