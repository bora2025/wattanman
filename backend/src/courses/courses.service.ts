import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// ─── Lifecycle constants ──────────────────────────────────────────────────
// Mirrors the documented state-flow:
//   DRAFT  →  PUBLISHED  →  ENROLLMENT  →  ACTIVE  →  COMPLETED  →  ARCHIVED
export const COURSE_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ENROLLMENT',
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

// Allowed direct transitions. Linear forward, plus archive from any non-archived
// state, plus moving back to DRAFT from PUBLISHED (in case of mistake).
const ALLOWED_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ENROLLMENT', 'DRAFT', 'ARCHIVED'],
  ENROLLMENT: ['ACTIVE', 'PUBLISHED', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

const LESSON_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
const PAGE_TYPES = ['CONTENT', 'QUESTION', 'BRANCH'] as const;

function toDate(v: string | Date | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

interface CourseInput {
  title?: string;
  description?: string | null;
  category?: string | null;
  classId?: string;
  status?: string;
  enrollmentOpen?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  coverImageUrl?: string | null;
}

interface LessonInput {
  title?: string;
  description?: string | null;
  order?: number;
  status?: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
  showProgressBar?: boolean;
  branchingEnabled?: boolean;
  totalPoints?: number;
  passingScore?: number | null;
}

interface PageInput {
  title?: string;
  pageType?: string;
  content?: any;
  order?: number;
  nextPageId?: string | null;
}

function sanitizeCourseInput(input: CourseInput) {
  const data: any = {};
  if (input.title !== undefined) data.title = String(input.title).trim();
  if (input.description !== undefined)
    data.description = input.description ? String(input.description).trim() : null;
  if (input.category !== undefined)
    data.category = input.category ? String(input.category).trim() : null;
  if (input.classId !== undefined) data.classId = String(input.classId);
  if (input.coverImageUrl !== undefined)
    data.coverImageUrl = input.coverImageUrl ? String(input.coverImageUrl).trim() : null;
  if (input.enrollmentOpen !== undefined) data.enrollmentOpen = !!input.enrollmentOpen;
  if (input.status !== undefined) {
    const s = String(input.status).toUpperCase();
    if (!COURSE_STATUSES.includes(s as CourseStatus)) {
      throw new BadRequestException(
        `status must be one of ${COURSE_STATUSES.join(', ')}`,
      );
    }
    data.status = s;
  }
  const sd = toDate(input.startDate);
  if (sd !== undefined) data.startDate = sd;
  const ed = toDate(input.endDate);
  if (ed !== undefined) data.endDate = ed;
  return data;
}

function sanitizeLessonInput(input: LessonInput) {
  const data: any = {};
  if (input.title !== undefined) data.title = String(input.title).trim();
  if (input.description !== undefined)
    data.description = input.description ? String(input.description).trim() : null;
  if (input.order !== undefined) data.order = Math.max(0, Number(input.order) || 0);
  if (input.status !== undefined) {
    const s = String(input.status).toUpperCase();
    if (!LESSON_STATUSES.includes(s as any)) {
      throw new BadRequestException(
        `Lesson status must be one of ${LESSON_STATUSES.join(', ')}`,
      );
    }
    data.status = s;
  }
  if (input.availableFrom !== undefined) data.availableFrom = toDate(input.availableFrom);
  if (input.availableUntil !== undefined) data.availableUntil = toDate(input.availableUntil);
  if (input.showProgressBar !== undefined)
    data.showProgressBar = !!input.showProgressBar;
  if (input.branchingEnabled !== undefined)
    data.branchingEnabled = !!input.branchingEnabled;
  if (input.totalPoints !== undefined)
    data.totalPoints = Math.max(0, Number(input.totalPoints) || 0);
  if (input.passingScore !== undefined) {
    if (input.passingScore === null) data.passingScore = null;
    else data.passingScore = Math.max(0, Number(input.passingScore) || 0);
  }
  return data;
}

function sanitizePageInput(input: PageInput) {
  const data: any = {};
  if (input.title !== undefined) data.title = String(input.title).trim();
  if (input.pageType !== undefined) {
    const t = String(input.pageType).toUpperCase();
    if (!PAGE_TYPES.includes(t as any)) {
      throw new BadRequestException(
        `pageType must be one of ${PAGE_TYPES.join(', ')}`,
      );
    }
    data.pageType = t;
  }
  if (input.content !== undefined) data.content = input.content ?? {};
  if (input.order !== undefined) data.order = Math.max(0, Number(input.order) || 0);
  if (input.nextPageId !== undefined)
    data.nextPageId = input.nextPageId ? String(input.nextPageId) : null;
  return data;
}

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────
  //  Authorisation helpers
  // ──────────────────────────────────────────────────────────────────────

  /** Ensures the teacher owns the class, or the user is admin. */
  private async assertCanManageCourse(
    courseId: string,
    userId: string,
    role: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { class: { select: { teacherId: true } } },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (this.isAdmin(role)) return course;
    if (course.createdById === userId) return course;
    if (course.class?.teacherId === userId) return course;
    throw new ForbiddenException('You do not have access to this course');
  }

  private isAdmin(role?: string) {
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Course CRUD
  // ──────────────────────────────────────────────────────────────────────

  async list(opts: {
    teacherUserId?: string;
    role?: string;
    classId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (opts.classId) where.classId = opts.classId;
    if (opts.status) where.status = String(opts.status).toUpperCase();

    // Scope to teacher's own classes unless admin
    if (!this.isAdmin(opts.role) && opts.teacherUserId) {
      const classes = await this.prisma.class.findMany({
        where: { teacherId: opts.teacherUserId },
        select: { id: true },
      });
      const myClassIds = classes.map((c) => c.id);
      where.OR = [
        { createdById: opts.teacherUserId },
        { classId: { in: myClassIds } },
      ];
    }

    return this.prisma.course.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, subject: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true, subject: true } },
        createdBy: { select: { id: true, name: true } },
        lessons: {
          orderBy: { order: 'asc' },
          include: { _count: { select: { pages: true } } },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  // ── 1. Draft State: create a course (status defaults to DRAFT) ─────────
  async create(body: CourseInput, createdById: string) {
    if (!body.title?.trim()) throw new BadRequestException('Title is required');
    if (!body.classId) throw new BadRequestException('classId is required');
    const data = sanitizeCourseInput(body);
    // Force DRAFT on create — explicit transitions handle the rest.
    data.status = 'DRAFT';
    return this.prisma.course.create({
      data: { ...data, createdById },
      include: {
        class: { select: { id: true, name: true, subject: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
    });
  }

  async update(id: string, body: CourseInput, userId: string, role: string) {
    await this.assertCanManageCourse(id, userId, role);
    const data = sanitizeCourseInput(body);
    // Ignore status changes via update() — use transition() instead.
    delete data.status;
    return this.prisma.course.update({
      where: { id },
      data,
      include: {
        class: { select: { id: true, name: true, subject: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    await this.assertCanManageCourse(id, userId, role);
    return this.prisma.course.delete({ where: { id } });
  }

  // ── State transition orchestrator ──────────────────────────────────────
  async transition(
    id: string,
    nextStatus: string,
    userId: string,
    role: string,
  ) {
    const course = await this.assertCanManageCourse(id, userId, role);
    const next = String(nextStatus || '').toUpperCase() as CourseStatus;
    if (!COURSE_STATUSES.includes(next)) {
      throw new BadRequestException(
        `status must be one of ${COURSE_STATUSES.join(', ')}`,
      );
    }
    const current = course.status as CourseStatus;
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    if (current === next) return course;
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}. Allowed: ${
          allowed.join(', ') || '(none)'
        }`,
      );
    }
    const data: any = { status: next };
    const now = new Date();
    if (next === 'PUBLISHED') {
      data.publishedAt = course.publishedAt ?? now;
    }
    if (next === 'ENROLLMENT') {
      data.enrollmentOpen = true;
    }
    if (next === 'ACTIVE') {
      // Close enrollment when the course actually starts
      data.enrollmentOpen = false;
      if (!course.startDate) data.startDate = now;
    }
    if (next === 'COMPLETED') {
      data.completedAt = now;
      data.enrollmentOpen = false;
      if (!course.endDate) data.endDate = now;
    }
    if (next === 'ARCHIVED') {
      data.archivedAt = now;
      data.enrollmentOpen = false;
    }
    const updated = await this.prisma.course.update({
      where: { id },
      data,
      include: {
        class: { select: { id: true, name: true, subject: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
    });

    if (next === 'PUBLISHED') {
      await this.notifyStudentsCoursePublished(updated.id);
    }
    if (next === 'ENROLLMENT') {
      await this.autoEnrollClassStudents(updated.id, updated.classId);
    }
    return updated;
  }

  private async notifyStudentsCoursePublished(courseId: string) {
    try {
      const c = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { title: true, classId: true, class: { select: { name: true } } },
      });
      if (!c) return;
      const students = await this.prisma.student.findMany({
        where: { classId: c.classId },
        select: { userId: true },
      });
      if (!students.length) return;
      await this.prisma.notification.createMany({
        data: students.map((s) => ({
          userId: s.userId,
          type: 'course_published',
          message: `New course available: "${c.title}" in ${c.class?.name ?? 'your class'}`,
        })),
      });
    } catch {
      /* best-effort */
    }
  }

  // ── 3. Enrollment State ───────────────────────────────────────────────
  private async autoEnrollClassStudents(courseId: string, classId: string) {
    const students = await this.prisma.student.findMany({
      where: { classId },
      select: { id: true },
    });
    if (!students.length) return;
    // Use individual upserts to respect the unique([courseId, studentId]) index.
    await this.prisma.$transaction(
      students.map((s) =>
        this.prisma.courseEnrollment.upsert({
          where: { courseId_studentId: { courseId, studentId: s.id } },
          create: { courseId, studentId: s.id, status: 'ENROLLED' },
          update: {},
        }),
      ),
    );
  }

  async enrollStudent(
    courseId: string,
    studentId: string,
    userId: string,
    role: string,
  ) {
    const course = await this.assertCanManageCourse(courseId, userId, role);
    if (!course.enrollmentOpen && course.status !== 'ENROLLMENT') {
      throw new ForbiddenException('Course is not open for enrollment');
    }
    return this.prisma.courseEnrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      create: { courseId, studentId, status: 'ENROLLED' },
      update: {},
    });
  }

  async listEnrollments(courseId: string, userId: string, role: string) {
    await this.assertCanManageCourse(courseId, userId, role);
    return this.prisma.courseEnrollment.findMany({
      where: { courseId },
      include: {
        student: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { enrolledAt: 'asc' },
    });
  }

  async unenrollStudent(
    courseId: string,
    studentId: string,
    userId: string,
    role: string,
  ) {
    await this.assertCanManageCourse(courseId, userId, role);
    return this.prisma.courseEnrollment.deleteMany({
      where: { courseId, studentId },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Lessons (CRUD)
  // ──────────────────────────────────────────────────────────────────────

  async listLessons(courseId: string) {
    return this.prisma.courseLesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { pages: true } } },
    });
  }

  async createLesson(
    courseId: string,
    body: LessonInput,
    userId: string,
    role: string,
  ) {
    const course = await this.assertCanManageCourse(courseId, userId, role);
    if (course.status === 'ARCHIVED' || course.status === 'COMPLETED') {
      throw new ForbiddenException(
        'Cannot add lessons to a completed or archived course',
      );
    }
    if (!body.title?.trim()) throw new BadRequestException('Lesson title is required');
    const data = sanitizeLessonInput(body);
    data.status = data.status || 'DRAFT';
    if (data.order === undefined) {
      const last = await this.prisma.courseLesson.findFirst({
        where: { courseId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      data.order = (last?.order ?? -1) + 1;
    }
    return this.prisma.courseLesson.create({
      data: { ...data, courseId },
      include: { _count: { select: { pages: true } } },
    });
  }

  async updateLesson(
    lessonId: string,
    body: LessonInput,
    userId: string,
    role: string,
  ) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true, status: true, publishedAt: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanManageCourse(lesson.courseId, userId, role);

    const data = sanitizeLessonInput(body);
    if (
      data.status === 'PUBLISHED' &&
      lesson.status !== 'PUBLISHED' &&
      !lesson.publishedAt
    ) {
      data.publishedAt = new Date();
    }
    return this.prisma.courseLesson.update({
      where: { id: lessonId },
      data,
      include: { _count: { select: { pages: true } } },
    });
  }

  async deleteLesson(lessonId: string, userId: string, role: string) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanManageCourse(lesson.courseId, userId, role);
    return this.prisma.courseLesson.delete({ where: { id: lessonId } });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Lesson Pages (CRUD)
  // ──────────────────────────────────────────────────────────────────────

  async listPages(lessonId: string) {
    return this.prisma.lessonPage.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
    });
  }

  async createPage(
    lessonId: string,
    body: PageInput,
    userId: string,
    role: string,
  ) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanManageCourse(lesson.courseId, userId, role);

    if (!body.title?.trim()) throw new BadRequestException('Page title is required');
    const data = sanitizePageInput(body);
    data.pageType = data.pageType || 'CONTENT';
    data.content = data.content ?? {};
    if (data.order === undefined) {
      const last = await this.prisma.lessonPage.findFirst({
        where: { lessonId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      data.order = (last?.order ?? -1) + 1;
    }
    return this.prisma.lessonPage.create({ data: { ...data, lessonId } });
  }

  async updatePage(
    pageId: string,
    body: PageInput,
    userId: string,
    role: string,
  ) {
    const page = await this.prisma.lessonPage.findUnique({
      where: { id: pageId },
      include: { lesson: { select: { courseId: true } } },
    });
    if (!page) throw new NotFoundException('Page not found');
    await this.assertCanManageCourse(page.lesson.courseId, userId, role);
    const data = sanitizePageInput(body);
    return this.prisma.lessonPage.update({ where: { id: pageId }, data });
  }

  async deletePage(pageId: string, userId: string, role: string) {
    const page = await this.prisma.lessonPage.findUnique({
      where: { id: pageId },
      include: { lesson: { select: { courseId: true } } },
    });
    if (!page) throw new NotFoundException('Page not found');
    await this.assertCanManageCourse(page.lesson.courseId, userId, role);
    return this.prisma.lessonPage.delete({ where: { id: pageId } });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Student-side
  // ──────────────────────────────────────────────────────────────────────

  async getStudentCourses(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, classId: true },
    });
    if (!student) return [];

    // Visible to a student: any course in their class that's at least PUBLISHED,
    // plus any course they're already enrolled in.
    return this.prisma.course.findMany({
      where: {
        OR: [
          {
            classId: student.classId ?? '__no_class__',
            status: { in: ['PUBLISHED', 'ENROLLMENT', 'ACTIVE', 'COMPLETED'] },
          },
          { enrollments: { some: { studentId: student.id } } },
        ],
      },
      include: {
        class: { select: { id: true, name: true, subject: true } },
        createdBy: { select: { id: true, name: true } },
        enrollments: { where: { studentId: student.id }, take: 1 },
        _count: { select: { lessons: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
