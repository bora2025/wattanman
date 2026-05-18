import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ExamService {
  constructor(private prisma: PrismaService) {}

  // ── Admin / Teacher: manage exams ──

  async getAll(classId?: string, status?: string) {
    return this.prisma.exam.findMany({
      where: {
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        class: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  async create(data: any, createdById: string) {
    const { questions, ...examData } = data;
    return this.prisma.exam.create({
      data: {
        ...examData,
        createdById,
        questions: questions?.length
          ? { create: questions.map((q: any, i: number) => ({ ...q, order: i })) }
          : undefined,
      },
      include: { questions: true },
    });
  }

  async update(id: string, data: any) {
    const { questions, ...examData } = data;
    const exam = await this.prisma.exam.update({
      where: { id },
      data: examData,
    });
    if (questions) {
      await this.prisma.examQuestion.deleteMany({ where: { examId: id } });
      await this.prisma.examQuestion.createMany({
        data: questions.map((q: any, i: number) => ({ ...q, examId: id, order: i })),
      });
    }
    return this.getOne(id);
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.exam.update({ where: { id }, data: { status } });
  }

  async delete(id: string) {
    return this.prisma.exam.delete({ where: { id } });
  }

  // ── Student: take exam ──

  async getStudentExams(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentId },
      select: { id: true, classId: true },
    });
    if (!student) return [];

    const exams = await this.prisma.exam.findMany({
      where: {
        OR: [{ classId: student.classId }, { classId: null }],
        status: { in: ['PUBLISHED', 'ACTIVE', 'COMPLETED'] },
      },
      include: {
        _count: { select: { questions: true } },
        attempts: { where: { studentId: student.id } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return exams;
  }

  async startAttempt(examId: string, userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new BadRequestException('Student profile not found');

    const existing = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: student.id } },
    });
    if (existing) return existing;

    return this.prisma.examAttempt.create({
      data: { examId, studentId: student.id, status: 'IN_PROGRESS' },
    });
  }

  async saveAnswers(attemptId: string, answers: Record<string, string>) {
    return this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { answers },
    });
  }

  async submitAttempt(attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { include: { questions: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    // Auto-grade MCQ questions
    const answers = (attempt.answers as Record<string, string>) ?? {};
    let score = 0;
    for (const q of attempt.exam.questions) {
      if (q.type === 'MCQ' && q.answer && answers[q.id] === q.answer) {
        score += q.marks;
      }
    }

    const passed = score >= attempt.exam.passMark;
    return this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        score,
        grade: passed ? 'PASS' : 'FAIL',
      },
    });
  }

  async getAttemptResult(attemptId: string) {
    return this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { include: { questions: true } } },
    });
  }

  async getExamAttempts(examId: string) {
    return this.prisma.examAttempt.findMany({
      where: { examId },
      include: {
        student: { include: { user: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
