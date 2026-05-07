import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('scoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoringController {
  constructor(private scoringService: ScoringService) {}

  // ─── Score Sheets ─────────────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Post('sheets')
  createSheet(@Body() data: { name: string; logoUrl?: string; classId?: string; studyYearId?: string }) {
    return this.scoringService.createSheet(data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('sheets')
  getSheets() {
    return this.scoringService.getSheets();
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('sheets/:id')
  getSheet(@Param('id') id: string) {
    return this.scoringService.getSheet(id);
  }

  @Roles('ADMIN', 'TEACHER')
  @Put('sheets/:id')
  updateSheet(@Param('id') id: string, @Body() data: { name?: string; logoUrl?: string; classId?: string; studyYearId?: string }) {
    return this.scoringService.updateSheet(id, data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('sheets/:id')
  deleteSheet(@Param('id') id: string) {
    return this.scoringService.deleteSheet(id);
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Post('sheets/:id/subjects')
  addSubject(@Param('id') scoreSheetId: string, @Body() data: { name: string; maxScore?: number; color?: string; order?: number }) {
    return this.scoringService.addSubject(scoreSheetId, data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Put('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() data: { name?: string; maxScore?: number; color?: string; order?: number }) {
    return this.scoringService.updateSubject(id, data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('subjects/:id')
  deleteSubject(@Param('id') id: string) {
    return this.scoringService.deleteSubject(id);
  }

  // ─── Exam Tabs ────────────────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Post('sheets/:id/exam-tabs')
  addExamTab(@Param('id') scoreSheetId: string, @Body() data: { label: string; type: string; order?: number }) {
    return this.scoringService.addExamTab(scoreSheetId, data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('exam-tabs/:id')
  deleteExamTab(@Param('id') id: string) {
    return this.scoringService.deleteExamTab(id);
  }

  // ─── Score Entries ────────────────────────────────────────────────────────

  @Roles('ADMIN', 'TEACHER')
  @Get('exam-tabs/:id/scores')
  getTabScores(@Param('id') examTabId: string, @Query('classId') classId?: string) {
    return this.scoringService.getTabScores(examTabId, classId);
  }

  @Roles('ADMIN', 'TEACHER')
  @Put('entries')
  upsertEntry(@Body() data: { examTabId: string; subjectId: string; studentId: string; score: number | null }) {
    return this.scoringService.upsertEntry(data);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('entries/bulk')
  bulkUpsertEntries(@Body() body: { entries: Array<{ examTabId: string; subjectId: string; studentId: string; score: number | null }> }) {
    return this.scoringService.bulkUpsertEntries(body.entries);
  }
}
