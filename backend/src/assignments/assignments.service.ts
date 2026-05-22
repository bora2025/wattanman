import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AssignmentsService {
  constructor(private prisma: PrismaService) {}

  // ── Teacher / Admin ──

  async getAll(classId?: string, status?: string) {
    return this.prisma.assignment.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        class: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByTeacher(teacherUserId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId: teacherUserId },
      select: { id: true },
    });
    const classIds = classes.map(c => c.id);
    return this.prisma.assignment.findMany({
      where: { classId: { in: classIds } },
      include: {
        class: { select: { id: true, name: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        submissions: {
          include: { student: { include: { user: { select: { name: true, photo: true } } } } },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    return a;
  }

  async create(data: any, createdById: string) {
    return this.prisma.assignment.create({
      data: { ...data, createdById },
      include: { class: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.assignment.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.assignment.delete({ where: { id } });
  }

  // ── Student ──

  async getStudentAssignments(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, classId: true },
    });
    if (!student || !student.classId) return [];

    const rows = await this.prisma.assignment.findMany({
      where: { classId: student.classId, status: { in: ['PUBLISHED', 'CLOSED'] } },
      include: {
        class: { select: { id: true, name: true, subject: true } },
        createdBy: { select: { id: true, name: true } },
        submissions: { where: { studentId: student.id }, take: 1 },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Flatten student-specific submission into a single field expected by the UI.
    return rows.map(({ submissions, ...rest }) => ({
      ...rest,
      submission: submissions[0] ?? null,
    }));
  }

  async submitAssignment(assignmentId: string, userId: string, data: { content?: string; attachmentUrl?: string }) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');

    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    const isLate = assignment?.dueDate && new Date() > assignment.dueDate;

    return this.prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
      create: {
        assignmentId,
        studentId: student.id,
        content: data.content,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? 'LATE' : 'SUBMITTED',
      },
      update: {
        content: data.content,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? 'LATE' : 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
  }

  async gradeSubmission(submissionId: string, data: { marks: number; feedback?: string }) {
    return this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { marks: data.marks, feedback: data.feedback, status: 'GRADED', gradedAt: new Date() },
    });
  }
}
