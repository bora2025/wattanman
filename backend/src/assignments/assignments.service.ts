import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const ALLOWED_TYPES = ['HOMEWORK', 'QUIZ', 'PROJECT', 'LAB', 'ESSAY'];
const ALLOWED_STATUS = ['DRAFT', 'PUBLISHED', 'CLOSED'];

type AssignmentInput = {
  title?: string;
  description?: string | null;
  instructions?: string | null;
  classId?: string;
  type?: string;
  weight?: number;
  availableFrom?: string | null;
  dueDate?: string | null;
  totalMarks?: number;
  allowLate?: boolean;
  latePenaltyPct?: number;
  maxAttempts?: number;
  status?: string;
  attachmentUrl?: string | null;
};

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function sanitizeWriteData(input: AssignmentInput) {
  const data: any = {};
  if (input.title !== undefined) data.title = String(input.title).trim();
  if (input.description !== undefined) data.description = input.description ? String(input.description).trim() : null;
  if (input.instructions !== undefined) data.instructions = input.instructions ? String(input.instructions).trim() : null;
  if (input.classId !== undefined) data.classId = input.classId;
  if (input.attachmentUrl !== undefined) data.attachmentUrl = input.attachmentUrl ? String(input.attachmentUrl).trim() : null;

  if (input.type !== undefined) {
    const t = String(input.type).toUpperCase();
    if (!ALLOWED_TYPES.includes(t)) throw new BadRequestException(`type must be one of ${ALLOWED_TYPES.join(', ')}`);
    data.type = t;
  }
  if (input.status !== undefined) {
    const s = String(input.status).toUpperCase();
    if (!ALLOWED_STATUS.includes(s)) throw new BadRequestException(`status must be one of ${ALLOWED_STATUS.join(', ')}`);
    data.status = s;
  }
  if (input.weight !== undefined) data.weight = Number(input.weight) || 1;
  if (input.totalMarks !== undefined) data.totalMarks = Number(input.totalMarks) || 0;
  if (input.latePenaltyPct !== undefined) data.latePenaltyPct = Math.max(0, Math.min(100, Number(input.latePenaltyPct) || 0));
  if (input.maxAttempts !== undefined) data.maxAttempts = Math.max(0, Number(input.maxAttempts) || 1);
  if (input.allowLate !== undefined) data.allowLate = !!input.allowLate;

  const dueDate = toDate(input.dueDate);
  if (dueDate !== undefined) data.dueDate = dueDate;
  const availableFrom = toDate(input.availableFrom);
  if (availableFrom !== undefined) data.availableFrom = availableFrom;

  return data;
}

@Injectable()
export class AssignmentsService {
  constructor(private prisma: PrismaService) {}

  // ── Teacher / Admin ──

  async getAll(classId?: string, status?: string) {
    return this.prisma.assignment.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(status ? { status: status.toUpperCase() } : {}),
      },
      include: {
        class: { select: { id: true, name: true, subject: true } },
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
        class: { select: { id: true, name: true, subject: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getOne(id: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true, subject: true } },
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

  async create(body: AssignmentInput, createdById: string) {
    if (!body.title?.trim()) throw new BadRequestException('Title is required');
    if (!body.classId) throw new BadRequestException('classId is required');
    const data = sanitizeWriteData(body);
    if (data.status === 'PUBLISHED') data.publishedAt = new Date();
    const created = await this.prisma.assignment.create({
      data: { ...data, createdById },
      include: { class: { select: { id: true, name: true, subject: true } } },
    });
    if (created.status === 'PUBLISHED') {
      await this.notifyStudentsPublished(created.id);
    }
    return created;
  }

  async update(id: string, body: AssignmentInput) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Assignment not found');
    const data = sanitizeWriteData(body);
    const transitionedToPublished = existing.status !== 'PUBLISHED' && data.status === 'PUBLISHED';
    if (transitionedToPublished) data.publishedAt = new Date();
    const updated = await this.prisma.assignment.update({ where: { id }, data });
    if (transitionedToPublished) {
      await this.notifyStudentsPublished(updated.id);
    }
    return updated;
  }

  async delete(id: string) {
    return this.prisma.assignment.delete({ where: { id } });
  }

  private async notifyStudentsPublished(assignmentId: string) {
    try {
      const a = await this.prisma.assignment.findUnique({
        where: { id: assignmentId },
        select: { title: true, classId: true, class: { select: { name: true } } },
      });
      if (!a) return;
      const students = await this.prisma.student.findMany({
        where: { classId: a.classId },
        select: { userId: true },
      });
      if (!students.length) return;
      await this.prisma.notification.createMany({
        data: students.map(s => ({
          userId: s.userId,
          type: 'assignment_published',
          message: `New assignment: "${a.title}" in ${a.class?.name ?? 'your class'}`,
        })),
      });
    } catch {}
  }

  // ── Student ──

  async getStudentAssignments(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, classId: true },
    });
    if (!student || !student.classId) return [];

    const now = new Date();
    const rows = await this.prisma.assignment.findMany({
      where: {
        classId: student.classId,
        status: { in: ['PUBLISHED', 'CLOSED'] },
        OR: [{ availableFrom: null }, { availableFrom: { lte: now } }],
      },
      include: {
        class: { select: { id: true, name: true, subject: true } },
        createdBy: { select: { id: true, name: true } },
        submissions: { where: { studentId: student.id }, take: 1 },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return rows.map(({ submissions, ...rest }) => ({
      ...rest,
      submission: submissions[0] ?? null,
    }));
  }

  async submitAssignment(assignmentId: string, userId: string, data: { content?: string; attachmentUrl?: string }) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');

    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status === 'DRAFT') throw new ForbiddenException('This assignment has not been published yet');
    if (assignment.status === 'CLOSED') throw new ForbiddenException('This assignment is closed for submissions');
    if (assignment.availableFrom && new Date() < assignment.availableFrom) {
      throw new ForbiddenException('This assignment is not yet available');
    }

    const now = new Date();
    const isLate = !!(assignment.dueDate && now > assignment.dueDate);
    if (isLate && !assignment.allowLate) {
      throw new ForbiddenException('Late submissions are not allowed for this assignment');
    }

    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
    });
    const maxAttempts = assignment.maxAttempts ?? 1;
    const currentAttempt = existing?.attemptNumber ?? 0;
    if (existing && maxAttempts > 0 && currentAttempt >= maxAttempts) {
      throw new ForbiddenException(`Maximum attempts (${maxAttempts}) reached`);
    }

    const content = data.content?.toString().trim() || null;
    const attachmentUrl = data.attachmentUrl?.toString().trim() || null;
    if (!content && !attachmentUrl) {
      throw new BadRequestException('Provide either content or an attachment URL');
    }

    return this.prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
      create: {
        assignmentId,
        studentId: student.id,
        content,
        attachmentUrl,
        status: isLate ? 'LATE' : 'SUBMITTED',
        attemptNumber: 1,
      },
      update: {
        content,
        attachmentUrl,
        status: isLate ? 'LATE' : 'SUBMITTED',
        attemptNumber: currentAttempt + 1,
        submittedAt: now,
        marks: null,
        feedback: null,
        gradedAt: null,
        latePenaltyApplied: null,
      },
    });
  }

  async gradeSubmission(submissionId: string, data: { marks: number; feedback?: string }) {
    const sub = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { select: { id: true, title: true, latePenaltyPct: true, totalMarks: true } },
        student: { select: { userId: true } },
      },
    });
    if (!sub) throw new NotFoundException('Submission not found');

    const rawMarks = Math.max(0, Number(data.marks) || 0);
    const cappedRaw = Math.min(rawMarks, sub.assignment.totalMarks ?? rawMarks);
    const isLate = sub.status === 'LATE';
    const penaltyPct = isLate ? sub.assignment.latePenaltyPct || 0 : 0;
    const finalMarks = Math.max(0, cappedRaw - (cappedRaw * penaltyPct) / 100);

    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        marks: finalMarks,
        feedback: data.feedback ?? null,
        status: 'GRADED',
        gradedAt: new Date(),
        latePenaltyApplied: penaltyPct || null,
      },
    });

    try {
      await this.prisma.notification.create({
        data: {
          userId: sub.student.userId,
          type: 'assignment_graded',
          message: `Your submission for "${sub.assignment.title}" was graded: ${finalMarks}/${sub.assignment.totalMarks}`,
        },
      });
    } catch {}

    return updated;
  }
}
