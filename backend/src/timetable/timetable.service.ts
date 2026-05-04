import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class TimetableService {
  constructor(private prisma: PrismaService) {}

  // ─── Timetable CRUD ────────────────────────────────────────────────

  async listTimetables() {
    return this.prisma.timetable.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, short: true, academicYear: true,
        periodsPerDay: true, numberOfDays: true, weekend: true,
        status: true, createdAt: true, updatedAt: true,
      },
    });
  }

  async getTimetable(id: string) {
    const tt = await this.prisma.timetable.findUnique({
      where: { id },
      include: {
        subjects: { orderBy: { name: 'asc' } },
        classes: { orderBy: { name: 'asc' }, include: { classTeacher: true } },
        classrooms: { orderBy: { name: 'asc' } },
        teachers: { orderBy: { lastName: 'asc' }, include: { classTeacher: true } },
        lessons: {
          include: { teacher: true, subject: true, class: true },
          orderBy: { createdAt: 'asc' },
        },
        entries: {
          include: { class: true, teacher: true, subject: true, classroom: true },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        },
      },
    });
    if (!tt) throw new NotFoundException('Timetable not found');
    return tt;
  }

  async createTimetable(data: {
    name: string;
    short?: string;
    academicYear: string;
    periodsPerDay?: number;
    numberOfDays?: number;
    weekend?: string[];
    timeOffRules?: string;
    distribution?: string;
    homeworkPrep?: string;
    maxOnDay?: number;
    docNotes?: string;
  }) {
    return this.prisma.timetable.create({ data });
  }

  async updateTimetable(id: string, data: Partial<{
    name: string; short: string; academicYear: string;
    periodsPerDay: number; numberOfDays: number; weekend: string[];
    timeOffRules: string; distribution: string; homeworkPrep: string;
    maxOnDay: number; docNotes: string; status: string;
  }>) {
    return this.prisma.timetable.update({ where: { id }, data });
  }

  async deleteTimetable(id: string) {
    return this.prisma.timetable.delete({ where: { id } });
  }

  // ─── Subjects ──────────────────────────────────────────────────────

  async createSubject(timetableId: string, data: {
    name: string; short: string; color?: string;
    picture?: string; classroomCount?: number; customFields?: object;
  }) {
    return this.prisma.timetableSubject.create({ data: { timetableId, ...data } });
  }

  async updateSubject(id: string, data: Partial<{
    name: string; short: string; color: string;
    picture: string; classroomCount: number; customFields: object;
  }>) {
    return this.prisma.timetableSubject.update({ where: { id }, data });
  }

  async deleteSubject(id: string) {
    return this.prisma.timetableSubject.delete({ where: { id } });
  }

  // ─── Classes ───────────────────────────────────────────────────────

  async createClass(timetableId: string, data: {
    name: string; short: string; color?: string;
    picture?: string; printSubjectPicture?: boolean; customFields?: object;
  }) {
    return this.prisma.timetableClass.create({ data: { timetableId, ...data } });
  }

  async updateClass(id: string, data: Partial<{
    name: string; short: string; color: string;
    picture: string; printSubjectPicture: boolean; customFields: object;
  }>) {
    return this.prisma.timetableClass.update({ where: { id }, data });
  }

  async deleteClass(id: string) {
    return this.prisma.timetableClass.delete({ where: { id } });
  }

  // ─── Classrooms ────────────────────────────────────────────────────

  async createClassroom(timetableId: string, data: {
    name: string; short: string; color?: string;
    picture?: string; customFields?: object;
  }) {
    return this.prisma.timetableClassroom.create({ data: { timetableId, ...data } });
  }

  async updateClassroom(id: string, data: Partial<{
    name: string; short: string; color: string;
    picture: string; customFields: object;
  }>) {
    return this.prisma.timetableClassroom.update({ where: { id }, data });
  }

  async deleteClassroom(id: string) {
    return this.prisma.timetableClassroom.delete({ where: { id } });
  }

  // ─── Teachers ──────────────────────────────────────────────────────

  async createTeacher(timetableId: string, data: {
    lastName: string; firstName: string; short: string;
    sex?: string; email?: string; phone?: string;
    color?: string; classTeacherId?: string;
  }) {
    const qrCode = crypto.randomBytes(16).toString('hex');
    return this.prisma.timetableTeacher.create({
      data: { timetableId, qrCode, ...data },
    });
  }

  async updateTeacher(id: string, data: Partial<{
    lastName: string; firstName: string; short: string;
    sex: string; email: string; phone: string;
    color: string; classTeacherId: string | null;
  }>) {
    return this.prisma.timetableTeacher.update({ where: { id }, data });
  }

  async deleteTeacher(id: string) {
    return this.prisma.timetableTeacher.delete({ where: { id } });
  }

  // ─── Lessons ───────────────────────────────────────────────────────

  async createLesson(timetableId: string, data: {
    teacherId: string; subjectId: string; classId: string;
    perWeek: number; lessonType?: string;
  }) {
    return this.prisma.timetableLesson.create({
      data: { timetableId, lessonType: 'SINGLE', ...data },
      include: { teacher: true, subject: true, class: true },
    });
  }

  async updateLesson(id: string, data: Partial<{
    teacherId: string; subjectId: string; classId: string;
    perWeek: number; lessonType: string;
  }>) {
    return this.prisma.timetableLesson.update({
      where: { id }, data,
      include: { teacher: true, subject: true, class: true },
    });
  }

  async deleteLesson(id: string) {
    return this.prisma.timetableLesson.delete({ where: { id } });
  }

  // ─── Entries (grid cells) ──────────────────────────────────────────

  async upsertEntry(timetableId: string, data: {
    classId: string; teacherId: string; subjectId: string;
    classroomId?: string; lessonId?: string; day: number; period: number;
  }) {
    return this.prisma.timetableEntry.upsert({
      where: { timetableId_classId_day_period: { timetableId, classId: data.classId, day: data.day, period: data.period } },
      create: { timetableId, ...data },
      update: { teacherId: data.teacherId, subjectId: data.subjectId, classroomId: data.classroomId, lessonId: data.lessonId },
      include: { class: true, teacher: true, subject: true, classroom: true },
    });
  }

  async deleteEntry(id: string) {
    return this.prisma.timetableEntry.delete({ where: { id } });
  }

  // ─── Generate (Test) ──────────────────────────────────────────────

  async generateTimetable(id: string) {
    const tt = await this.getTimetable(id);

    // Clear existing entries
    await this.prisma.timetableEntry.deleteMany({ where: { timetableId: id } });

    const days = tt.numberOfDays;
    const maxPeriods = tt.periodsPerDay;
    const created: any[] = [];

    // Simple greedy fill: for each lesson, assign to empty slots round-robin
    for (const lesson of tt.lessons) {
      let assigned = 0;
      const needed = lesson.perWeek;

      // Build occupied slots for this class
      const occupied = new Set<string>();
      for (const e of created) {
        if (e.classId === lesson.classId) {
          occupied.add(`${e.day}_${e.period}`);
        }
      }

      for (let day = 1; day <= days && assigned < needed; day++) {
        for (let period = 1; period <= maxPeriods && assigned < needed; period++) {
          const key = `${day}_${period}`;
          if (!occupied.has(key)) {
            const entry = await this.prisma.timetableEntry.create({
              data: {
                timetableId: id,
                lessonId: lesson.id,
                classId: lesson.classId,
                teacherId: lesson.teacherId,
                subjectId: lesson.subjectId,
                day,
                period,
              },
            });
            created.push(entry);
            occupied.add(key);
            assigned++;
          }
        }
      }
    }

    return { generated: created.length, entries: created };
  }

  // ─── Teacher Attendance ────────────────────────────────────────────

  async markTeacherAttendance(teacherId: string, date: string, period: number, status = 'PRESENT') {
    const dateObj = new Date(date + 'T00:00:00.000Z');
    return this.prisma.timetableTeacherAttendance.upsert({
      where: { teacherId_date_period: { teacherId, date: dateObj, period } },
      create: { teacherId, date: dateObj, period, status, checkIn: new Date() },
      update: { status, checkIn: new Date() },
    });
  }

  async markTeacherAttendanceByQr(qrCode: string, period: number) {
    const teacher = await this.prisma.timetableTeacher.findUnique({ where: { qrCode } });
    if (!teacher) throw new NotFoundException('Teacher QR code not found');
    const today = new Date().toISOString().split('T')[0];
    return this.markTeacherAttendance(teacher.id, today, period, 'PRESENT');
  }

  async getTeacherAttendanceReport(timetableId: string, startDate: string, endDate: string) {
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');
    const teachers = await this.prisma.timetableTeacher.findMany({
      where: { timetableId },
      include: {
        attendances: { where: { date: { gte: start, lte: end } }, orderBy: { date: 'asc' } },
        entries: { where: { timetable: { id: timetableId } } },
      },
    });
    return teachers;
  }
}
