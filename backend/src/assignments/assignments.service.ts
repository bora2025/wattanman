import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const ALLOWED_TYPES = ['HOMEWORK', 'QUIZ', 'PROJECT', 'LAB', 'ESSAY'];
const ALLOWED_STATUS = ['DRAFT', 'PUBLISHED', 'CLOSED'];
const ALLOWED_QUESTION_TYPES = ['MCQ', 'TF', 'MATCHING', 'ESSAY', 'NUMERICAL'];

function sanitizeQuestionInput(body: any) {
  const type = String(body.type || '').toUpperCase();
  if (!ALLOWED_QUESTION_TYPES.includes(type)) {
    throw new BadRequestException(`Question type must be one of ${ALLOWED_QUESTION_TYPES.join(', ')}`);
  }
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new BadRequestException('Question prompt is required');
  const points = Math.max(0, Number(body.points) || 1);
  const raw = body.data ?? {};
  let data: any;
  switch (type) {
    case 'MCQ': {
      const choices = Array.isArray(raw.choices) ? raw.choices : [];
      const cleanedChoices = choices
        .filter((c: any) => c && (c.text ?? '').toString().trim())
        .map((c: any, i: number) => ({
          id: String(c.id || `c${i}`),
          text: String(c.text).trim(),
          isCorrect: !!c.isCorrect,
        }));
      if (cleanedChoices.length < 2) throw new BadRequestException('MCQ needs at least 2 choices');
      if (!cleanedChoices.some(c => c.isCorrect)) throw new BadRequestException('MCQ needs at least 1 correct choice');
      data = { choices: cleanedChoices, multiple: !!raw.multiple };
      break;
    }
    case 'TF': {
      data = { correct: !!raw.correct };
      break;
    }
    case 'MATCHING': {
      const left = Array.isArray(raw.left) ? raw.left : [];
      const right = Array.isArray(raw.right) ? raw.right : [];
      const cleanedLeft = left.filter((x: any) => (x?.text ?? '').toString().trim()).map((x: any, i: number) => ({ id: String(x.id || `l${i}`), text: String(x.text).trim() }));
      const cleanedRight = right.filter((x: any) => (x?.text ?? '').toString().trim()).map((x: any, i: number) => ({ id: String(x.id || `r${i}`), text: String(x.text).trim() }));
      if (cleanedLeft.length < 2 || cleanedRight.length < 2) throw new BadRequestException('Matching needs at least 2 items on each side');
      const pairs = Array.isArray(raw.pairs) ? raw.pairs : [];
      const cleanedPairs = pairs
        .filter((p: any) => p && cleanedLeft.some(l => l.id === p.leftId) && cleanedRight.some(r => r.id === p.rightId))
        .map((p: any) => ({ leftId: String(p.leftId), rightId: String(p.rightId) }));
      if (!cleanedPairs.length) throw new BadRequestException('Matching needs at least one correct pair');
      data = { left: cleanedLeft, right: cleanedRight, pairs: cleanedPairs };
      break;
    }
    case 'NUMERICAL': {
      const correct = Number(raw.correct);
      if (isNaN(correct)) throw new BadRequestException('Numerical question needs a numeric correct answer');
      const tolerance = Math.max(0, Number(raw.tolerance) || 0);
      data = { correct, tolerance };
      break;
    }
    case 'ESSAY':
    default:
      data = { minWords: Math.max(0, Number(raw.minWords) || 0) };
      break;
  }
  return { type, prompt, points, data };
}

function sanitizeQuestionForStudent(q: { id: string; type: string; prompt: string; points: number; order: number; data: any }) {
  const d = q.data || {};
  let safe: any;
  switch (q.type) {
    case 'MCQ':
      safe = {
        choices: (d.choices || []).map((c: any) => ({ id: c.id, text: c.text })),
        multiple: !!d.multiple,
      };
      break;
    case 'TF':
      safe = {};
      break;
    case 'MATCHING':
      safe = { left: d.left || [], right: d.right || [] };
      break;
    case 'NUMERICAL':
      safe = {};
      break;
    case 'ESSAY':
    default:
      safe = { minWords: d.minWords || 0 };
      break;
  }
  return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, order: q.order, data: safe };
}

function gradeQuestion(q: { type: string; points: number; data: any }, response: any): { pointsAwarded: number | null; autoGraded: boolean } {
  if (response == null) {
    if (q.type === 'ESSAY') return { pointsAwarded: null, autoGraded: false };
    return { pointsAwarded: 0, autoGraded: true };
  }
  const d = q.data || {};
  switch (q.type) {
    case 'MCQ': {
      const correctIds = new Set((d.choices || []).filter((c: any) => c.isCorrect).map((c: any) => c.id));
      const chosen = new Set(Array.isArray(response) ? response.map(String) : [String(response)]);
      const equal = chosen.size === correctIds.size && [...chosen].every(id => correctIds.has(id));
      return { pointsAwarded: equal ? q.points : 0, autoGraded: true };
    }
    case 'TF':
      return { pointsAwarded: !!response === !!d.correct ? q.points : 0, autoGraded: true };
    case 'MATCHING': {
      const correctMap = new Map<string, string>((d.pairs || []).map((p: any) => [p.leftId, p.rightId]));
      const given = Array.isArray(response) ? response : [];
      let correct = 0;
      for (const p of given) {
        if (p && correctMap.get(String(p.leftId)) === String(p.rightId)) correct++;
      }
      const totalPairs = correctMap.size || 1;
      return { pointsAwarded: (q.points * correct) / totalPairs, autoGraded: true };
    }
    case 'NUMERICAL': {
      const num = Number(response);
      if (isNaN(num)) return { pointsAwarded: 0, autoGraded: true };
      const ok = Math.abs(num - Number(d.correct)) <= Number(d.tolerance || 0);
      return { pointsAwarded: ok ? q.points : 0, autoGraded: true };
    }
    case 'ESSAY':
    default:
      return { pointsAwarded: null, autoGraded: false };
  }
}

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

  // ── Quiz Questions (Teacher) ──

  async listQuestions(assignmentId: string) {
    return this.prisma.quizQuestion.findMany({
      where: { assignmentId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createQuestion(assignmentId: string, body: any) {
    const a = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found');
    const cleaned = sanitizeQuestionInput(body);
    const count = await this.prisma.quizQuestion.count({ where: { assignmentId } });
    const created = await this.prisma.quizQuestion.create({
      data: {
        assignmentId,
        order: body.order != null ? Number(body.order) : count,
        type: cleaned.type,
        prompt: cleaned.prompt,
        points: cleaned.points,
        data: cleaned.data,
      },
    });
    await this.syncAssignmentTotalMarks(assignmentId);
    return created;
  }

  async updateQuestion(questionId: string, body: any) {
    const existing = await this.prisma.quizQuestion.findUnique({ where: { id: questionId } });
    if (!existing) throw new NotFoundException('Question not found');
    const cleaned = sanitizeQuestionInput({ ...existing, ...body, data: body.data ?? existing.data });
    const updated = await this.prisma.quizQuestion.update({
      where: { id: questionId },
      data: {
        type: cleaned.type,
        prompt: cleaned.prompt,
        points: cleaned.points,
        data: cleaned.data,
        ...(body.order != null ? { order: Number(body.order) } : {}),
      },
    });
    await this.syncAssignmentTotalMarks(existing.assignmentId);
    return updated;
  }

  async deleteQuestion(questionId: string) {
    const existing = await this.prisma.quizQuestion.findUnique({ where: { id: questionId } });
    if (!existing) throw new NotFoundException('Question not found');
    const deleted = await this.prisma.quizQuestion.delete({ where: { id: questionId } });
    await this.syncAssignmentTotalMarks(existing.assignmentId);
    return deleted;
  }

  private async syncAssignmentTotalMarks(assignmentId: string) {
    const agg = await this.prisma.quizQuestion.aggregate({
      where: { assignmentId },
      _sum: { points: true },
    });
    const total = agg._sum.points ?? 0;
    if (total > 0) {
      await this.prisma.assignment.update({ where: { id: assignmentId }, data: { totalMarks: total } });
    }
  }

  // ── Quiz (Student) ──

  async getStudentQuiz(assignmentId: string, userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.classId !== student.classId) throw new ForbiddenException('Not your class');
    if (assignment.status === 'DRAFT') throw new ForbiddenException('Quiz not published yet');
    const questions = await this.prisma.quizQuestion.findMany({
      where: { assignmentId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
      include: { answers: true },
    });
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        instructions: assignment.instructions,
        dueDate: assignment.dueDate,
        totalMarks: assignment.totalMarks,
        maxAttempts: assignment.maxAttempts,
        allowLate: assignment.allowLate,
      },
      questions: questions.map(sanitizeQuestionForStudent),
      submission: submission ? {
        id: submission.id,
        status: submission.status,
        marks: submission.marks,
        attemptNumber: submission.attemptNumber,
        submittedAt: submission.submittedAt,
        answers: submission.answers.map(a => ({ questionId: a.questionId, response: a.response, pointsAwarded: a.pointsAwarded })),
      } : null,
    };
  }

  async submitQuiz(assignmentId: string, userId: string, body: { answers: Array<{ questionId: string; response: any }> }) {
    const student = await this.prisma.student.findUnique({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.classId !== student.classId) throw new ForbiddenException('Not your class');
    if (assignment.status === 'DRAFT') throw new ForbiddenException('Quiz not published yet');
    if (assignment.status === 'CLOSED') throw new ForbiddenException('Quiz is closed');
    if (assignment.availableFrom && new Date() < assignment.availableFrom) {
      throw new ForbiddenException('Quiz is not yet available');
    }
    const now = new Date();
    const isLate = !!(assignment.dueDate && now > assignment.dueDate);
    if (isLate && !assignment.allowLate) throw new ForbiddenException('Late submissions are not allowed');

    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
    });
    const maxAttempts = assignment.maxAttempts ?? 1;
    const currentAttempt = existing?.attemptNumber ?? 0;
    if (existing && maxAttempts > 0 && currentAttempt >= maxAttempts) {
      throw new ForbiddenException(`Maximum attempts (${maxAttempts}) reached`);
    }

    const questions = await this.prisma.quizQuestion.findMany({ where: { assignmentId } });
    if (!questions.length) throw new BadRequestException('This quiz has no questions yet');
    const byId = new Map(questions.map(q => [q.id, q]));
    const answersByQ = new Map<string, any>();
    for (const a of body.answers || []) {
      if (a && a.questionId && byId.has(a.questionId)) answersByQ.set(a.questionId, a.response);
    }

    let autoTotal = 0;
    let hasEssay = false;
    const answersToCreate: Array<{ questionId: string; response: any; pointsAwarded: number | null; autoGraded: boolean }> = [];
    for (const q of questions) {
      const resp = answersByQ.has(q.id) ? answersByQ.get(q.id) : null;
      const { pointsAwarded, autoGraded } = gradeQuestion(q, resp);
      if (!autoGraded) hasEssay = true;
      if (pointsAwarded != null) autoTotal += pointsAwarded;
      answersToCreate.push({ questionId: q.id, response: resp ?? null, pointsAwarded, autoGraded });
    }

    // Apply late penalty to auto marks (essay portion will be added by teacher later).
    const penaltyPct = isLate ? assignment.latePenaltyPct || 0 : 0;
    const adjustedAuto = Math.max(0, autoTotal - (autoTotal * penaltyPct) / 100);

    const submission = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.assignmentSubmission.upsert({
        where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
        create: {
          assignmentId,
          studentId: student.id,
          content: null,
          attachmentUrl: null,
          status: hasEssay ? (isLate ? 'LATE' : 'SUBMITTED') : 'GRADED',
          attemptNumber: 1,
          marks: hasEssay ? null : adjustedAuto,
          latePenaltyApplied: penaltyPct || null,
          gradedAt: hasEssay ? null : new Date(),
        },
        update: {
          status: hasEssay ? (isLate ? 'LATE' : 'SUBMITTED') : 'GRADED',
          attemptNumber: currentAttempt + 1,
          submittedAt: now,
          marks: hasEssay ? null : adjustedAuto,
          feedback: null,
          gradedAt: hasEssay ? null : new Date(),
          latePenaltyApplied: penaltyPct || null,
        },
      });
      await tx.quizAnswer.deleteMany({ where: { submissionId: sub.id } });
      if (answersToCreate.length) {
        await tx.quizAnswer.createMany({
          data: answersToCreate.map(a => ({ ...a, submissionId: sub.id })),
        });
      }
      return sub;
    });

    return {
      submissionId: submission.id,
      autoScore: autoTotal,
      adjustedAutoScore: adjustedAuto,
      hasManualGrading: hasEssay,
      latePenaltyApplied: penaltyPct || null,
    };
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
