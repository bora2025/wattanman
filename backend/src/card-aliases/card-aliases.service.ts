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

  /**
   * Resolves a raw QR/card value to a student using the same priority chain
   * as wattamanScan, but WITHOUT recording any attendance.
   * Used for the auto-link flow when the modal is open.
   */
  async resolveStudent(qrData: string) {
    if (!qrData) return null;
    const include = {
      user: { select: { name: true, photo: true } },
      class: { select: { name: true } },
    };

    // 1. Card-alias
    const alias = await this.prisma.cardAlias.findUnique({
      where: { qrValue: qrData },
      include: { student: { include } },
    });
    if (alias?.student) {
      const s = alias.student as any;
      return { id: s.id, studentNumber: s.studentNumber, name: s.user?.name ?? null, photo: s.photo ?? s.user?.photo ?? null, className: s.class?.name ?? null };
    }

    // 2-4. Direct fields
    const byField = await this.prisma.student.findFirst({
      where: { OR: [{ id: qrData }, { userId: qrData }, { qrCode: qrData }] },
      include,
    });
    if (byField) {
      return { id: byField.id, studentNumber: (byField as any).studentNumber, name: (byField as any).user?.name ?? null, photo: (byField as any).photo ?? (byField as any).user?.photo ?? null, className: (byField as any).class?.name ?? null };
    }

    // 5. studentNumber fallback
    const byNum = await this.prisma.student.findFirst({
      where: { studentNumber: qrData },
      include,
      orderBy: { updatedAt: 'desc' },
    });
    if (byNum) {
      return { id: byNum.id, studentNumber: (byNum as any).studentNumber, name: (byNum as any).user?.name ?? null, photo: (byNum as any).photo ?? (byNum as any).user?.photo ?? null, className: (byNum as any).class?.name ?? null };
    }

    return null;
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
