import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ParentService {
  constructor(private prisma: PrismaService) {}

  async getChildren(parentUserId: string) {
    return this.prisma.student.findMany({
      where: { parentId: parentUserId },
      include: {
        user: { select: { id: true, name: true, photo: true, email: true } },
        class: { select: { id: true, name: true, subject: true } },
      },
    });
  }

  async getChildAttendance(studentId: string, from?: string, to?: string) {
    return this.prisma.attendance.findMany({
      where: {
        studentId,
        ...(from && to
          ? { date: { gte: new Date(from), lte: new Date(to) } }
          : {}),
      },
      include: { class: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 90,
    });
  }

  async getChildGrades(studentId: string) {
    return this.prisma.assignmentSubmission.findMany({
      where: { studentId, status: 'GRADED' },
      include: {
        assignment: {
          include: { class: { select: { name: true, subject: true } } },
        },
      },
      orderBy: { gradedAt: 'desc' },
    });
  }

  async getChildFees(studentId: string) {
    return this.prisma.feeRecord.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
