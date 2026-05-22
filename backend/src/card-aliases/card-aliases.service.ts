import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CardAliasesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.cardAlias.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            studentNumber: true,
            user: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
      },
    });
  }

  async create(qrValue: string, studentId: string, createdById?: string) {
    if (!qrValue || !studentId) {
      throw new BadRequestException('qrValue and studentId are required');
    }

    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    // Reject if qrValue would conflict with an existing student lookup
    const existingStudent = await this.prisma.student.findFirst({
      where: {
        OR: [
          { id: qrValue },
          { userId: qrValue },
          { qrCode: qrValue },
          { studentNumber: qrValue },
        ],
      },
      select: { id: true },
    });
    if (existingStudent && existingStudent.id !== studentId) {
      throw new ConflictException(
        'This QR value already resolves to a different student via direct fields',
      );
    }

    try {
      return await this.prisma.cardAlias.create({
        data: { qrValue, studentId, createdById },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('This card is already linked to a student');
      }
      throw err;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.cardAlias.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Alias not found');
    await this.prisma.cardAlias.delete({ where: { id } });
    return { success: true };
  }

  /** Lightweight student list for the link-card picker. */
  async searchStudents(query?: string) {
    const q = (query ?? '').trim();
    const where = q
      ? {
          OR: [
            { studentNumber: { contains: q, mode: 'insensitive' as const } },
            { user: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    return this.prisma.student.findMany({
      where,
      take: 50,
      orderBy: { studentNumber: 'asc' },
      select: {
        id: true,
        studentNumber: true,
        photo: true,
        user: { select: { name: true, photo: true } },
        class: { select: { name: true } },
      },
    });
  }
}
