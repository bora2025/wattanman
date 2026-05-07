import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  // ─── Score Sheets ─────────────────────────────────────────────────────────

  async createSheet(data: { name: string; logoUrl?: string; classId?: string; studyYearId?: string }) {
    return this.prisma.scoreSheet.create({ data, include: { subjects: true, examTabs: true } });
  }

  async getSheets() {
    return this.prisma.scoreSheet.findMany({
      include: {
        subjects: { orderBy: { order: 'asc' } },
        examTabs: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSheet(id: string) {
    const sheet = await this.prisma.scoreSheet.findUnique({
      where: { id },
      include: {
        subjects: { orderBy: { order: 'asc' } },
        examTabs: { orderBy: { order: 'asc' } },
      },
    });
    if (!sheet) throw new NotFoundException('Score sheet not found');
    return sheet;
  }

  async updateSheet(id: string, data: { name?: string; logoUrl?: string; classId?: string; studyYearId?: string }) {
    return this.prisma.scoreSheet.update({ where: { id }, data });
  }

  async deleteSheet(id: string) {
    return this.prisma.scoreSheet.delete({ where: { id } });
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async addSubject(scoreSheetId: string, data: { name: string; maxScore?: number; color?: string; order?: number }) {
    return this.prisma.scoreSubject.create({ data: { scoreSheetId, ...data } });
  }

  async updateSubject(id: string, data: { name?: string; maxScore?: number; color?: string; order?: number }) {
    return this.prisma.scoreSubject.update({ where: { id }, data });
  }

  async deleteSubject(id: string) {
    return this.prisma.scoreSubject.delete({ where: { id } });
  }

  // ─── Exam Tabs ────────────────────────────────────────────────────────────

  async addExamTab(scoreSheetId: string, data: { label: string; type: string; order?: number }) {
    return this.prisma.scoreExamTab.create({ data: { scoreSheetId, ...data } });
  }

  async deleteExamTab(id: string) {
    return this.prisma.scoreExamTab.delete({ where: { id } });
  }

  // ─── Score Entries ────────────────────────────────────────────────────────

  async getTabScores(examTabId: string, classId?: string) {
    // Fetch all students in the class
    const studentsQuery: any = {};
    if (classId) studentsQuery.classId = classId;

    const [entries, students] = await Promise.all([
      this.prisma.scoreEntry.findMany({
        where: { examTabId },
        include: { subject: true },
      }),
      this.prisma.student.findMany({
        where: studentsQuery,
        include: { user: { select: { name: true } } },
        orderBy: { studentNumber: 'asc' },
      }),
    ]);

    return { entries, students };
  }

  async upsertEntry(data: { examTabId: string; subjectId: string; studentId: string; score: number | null }) {
    return this.prisma.scoreEntry.upsert({
      where: {
        examTabId_subjectId_studentId: {
          examTabId: data.examTabId,
          subjectId: data.subjectId,
          studentId: data.studentId,
        },
      },
      create: data,
      update: { score: data.score },
    });
  }

  async bulkUpsertEntries(entries: Array<{ examTabId: string; subjectId: string; studentId: string; score: number | null }>) {
    const ops = entries.map(e =>
      this.prisma.scoreEntry.upsert({
        where: {
          examTabId_subjectId_studentId: {
            examTabId: e.examTabId,
            subjectId: e.subjectId,
            studentId: e.studentId,
          },
        },
        create: e,
        update: { score: e.score },
      }),
    );
    return this.prisma.$transaction(ops);
  }
}
