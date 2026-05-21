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

    // Auto-grade MCQ questions only.
    const answers = (attempt.answers as Record<string, string>) ?? {};
    let mcqScore = 0;
    let hasNonMcq = false;
    for (const q of attempt.exam.questions) {
      if (q.type === 'MCQ') {
        if (q.answer && answers[q.id] === q.answer) {
          mcqScore += q.marks;
        }
      } else {
        hasNonMcq = true;
      }
    }

    // If the exam is MCQ-only, fully grade now. Otherwise leave for teacher.
    if (!hasNonMcq) {
      const passed = mcqScore >= attempt.exam.passMark;
      return this.prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'GRADED',
          submittedAt: new Date(),
          gradedAt: new Date(),
          score: mcqScore,
          grade: passed ? 'PASS' : 'FAIL',
        },
      });
    }

    // Mixed/essay exam — wait for manual grading. Store partial MCQ score for visibility.
    return this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        score: mcqScore,
        grade: null,
      },
    });
  }

  // Teacher manually grades non-MCQ questions for a submitted attempt.
  async gradeAttempt(
    attemptId: string,
    perQuestionMarks: Record<string, number>,
    feedback?: string,
  ) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: { include: { questions: true } } },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const answers = (attempt.answers as Record<string, string>) ?? {};
    let total = 0;
    const sanitizedManual: Record<string, number> = {};
    for (const q of attempt.exam.questions) {
      if (q.type === 'MCQ') {
        // Always auto-grade MCQ; teachers cannot override here.
        if (q.answer && answers[q.id] === q.answer) total += q.marks;
        continue;
      }
      const raw = perQuestionMarks?.[q.id];
      const m = typeof raw === 'number' && !isNaN(raw) ? Math.max(0, Math.min(q.marks, raw)) : 0;
      sanitizedManual[q.id] = m;
      total += m;
    }

    const passed = total >= attempt.exam.passMark;
    return this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'GRADED',
        gradedAt: new Date(),
        score: total,
        grade: passed ? 'PASS' : 'FAIL',
        manualMarks: sanitizedManual,
        feedback: feedback ?? null,
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

  // Aggregated exam results for the student-facing scores page.
  async getStudentResults(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) return [];
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId: student.id },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalMarks: true,
            passMark: true,
            class: { select: { id: true, name: true, subject: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return attempts.map(a => ({
      id: a.id,
      examId: a.examId,
      examTitle: a.exam.title,
      className: a.exam.class?.name ?? null,
      subject: a.exam.class?.subject ?? null,
      totalMarks: a.exam.totalMarks,
      passMark: a.exam.passMark,
      score: a.score,
      grade: a.grade,
      status: a.status,
      submittedAt: a.submittedAt,
      gradedAt: a.gradedAt,
    }));
  }
}
