import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

  // ─── Students list (for the "Add Fee" dropdown) ───────────────────────────

  async getStudents() {
    const students = await this.prisma.student.findMany({
      include: {
        user: { select: { name: true } },
        class: { select: { name: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });
    return students.map(s => ({
      id: s.id,
      studentNumber: s.studentNumber ?? '',
      name: s.user.name,
      class: s.class?.name ?? '',
    }));
  }

  // ─── Fee Records ──────────────────────────────────────────────────────────

  async getAll(status?: string, search?: string) {
    const records = await this.prisma.feeRecord.findMany({
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
        payments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = records.map(r => this.mapRecord(r));

    // Filter by status
    let filtered = mapped;
    if (status && status !== 'all') {
      filtered = filtered.filter(r => this.computeStatus(r) === status);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        r =>
          r.studentName.toLowerCase().includes(q) ||
          r.class.toLowerCase().includes(q),
      );
    }

    return filtered;
  }

  async getOne(id: string) {
    const r = await this.prisma.feeRecord.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('Fee record not found');
    return this.mapRecord(r);
  }

  async create(data: {
    studentId: string;
    totalAmount: number;
    dueDate: string;
    term?: string;
    notes?: string;
    createdById: string;
  }) {
    const student = await this.prisma.student.findUnique({ where: { id: data.studentId } });
    if (!student) throw new BadRequestException('Student not found');

    const record = await this.prisma.feeRecord.create({
      data: {
        studentId: data.studentId,
        totalAmount: data.totalAmount,
        paidAmount: 0,
        dueDate: new Date(data.dueDate),
        term: data.term ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById,
      },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
        payments: true,
      },
    });
    return this.mapRecord(record);
  }

  async update(
    id: string,
    data: { totalAmount?: number; dueDate?: string; term?: string; notes?: string },
  ) {
    const existing = await this.prisma.feeRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fee record not found');

    const record = await this.prisma.feeRecord.update({
      where: { id },
      data: {
        ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
        ...(data.dueDate !== undefined && { dueDate: new Date(data.dueDate) }),
        ...(data.term !== undefined && { term: data.term }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    return this.mapRecord(record);
  }

  async delete(id: string) {
    const existing = await this.prisma.feeRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fee record not found');
    await this.prisma.feeRecord.delete({ where: { id } });
    return { success: true };
  }

  // ─── Payments ─────────────────────────────────────────────────────────────

  async recordPayment(
    feeRecordId: string,
    data: { amount: number; note?: string; createdById: string },
  ) {
    const record = await this.prisma.feeRecord.findUnique({ where: { id: feeRecordId } });
    if (!record) throw new NotFoundException('Fee record not found');

    const balance = record.totalAmount - record.paidAmount;
    if (data.amount <= 0) throw new BadRequestException('Amount must be greater than 0');
    if (data.amount > balance) {
      throw new BadRequestException(`Amount exceeds outstanding balance ($${balance})`);
    }

    await this.prisma.$transaction([
      this.prisma.feePayment.create({
        data: {
          feeRecordId,
          amount: data.amount,
          note: data.note ?? null,
          createdById: data.createdById,
        },
      }),
      this.prisma.feeRecord.update({
        where: { id: feeRecordId },
        data: { paidAmount: { increment: data.amount } },
      }),
    ]);

    return this.getOne(feeRecordId);
  }

  // ─── Summary stats ────────────────────────────────────────────────────────

  async getSummary() {
    const records = await this.getAll();
    const totalRevenue = records.reduce((s, r) => s + r.paidAmount, 0);
    const pendingAmount = records.reduce((s, r) => s + Math.max(0, r.totalAmount - r.paidAmount), 0);
    const paidCount = records.filter(r => this.computeStatus(r) === 'paid').length;
    const collectionRate =
      records.length > 0 ? Math.round((paidCount / records.length) * 100) : 0;

    return { totalRevenue, pendingAmount, paidCount, collectionRate, total: records.length };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private mapRecord(r: any) {
    return {
      id: r.id,
      studentId: r.studentId,
      studentName: r.student.user.name,
      studentNumber: r.student.studentNumber ?? '',
      class: r.student.class?.name ?? '',
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      dueDate: r.dueDate instanceof Date
        ? r.dueDate.toISOString().split('T')[0]
        : String(r.dueDate).split('T')[0],
      term: r.term ?? '',
      notes: r.notes ?? '',
      payments: (r.payments ?? []).map((p: any) => ({
        id: p.id,
        amount: p.amount,
        date: p.createdAt instanceof Date
          ? p.createdAt.toISOString().split('T')[0]
          : String(p.createdAt).split('T')[0],
        note: p.note ?? '',
        createdBy: p.createdById,
      })),
    };
  }

  private computeStatus(r: { totalAmount: number; paidAmount: number; dueDate: string }) {
    const balance = r.totalAmount - r.paidAmount;
    if (balance <= 0) return 'paid';
    if (new Date(r.dueDate) < new Date()) return 'overdue';
    if (r.paidAmount > 0) return 'partial';
    return 'pending';
  }
}
