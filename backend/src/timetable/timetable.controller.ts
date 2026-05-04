import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableController {
  constructor(private readonly svc: TimetableService) {}

  // ─── Timetable documents ─────────────────────────────────────────

  @Get()
  list() { return this.svc.listTimetables(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.svc.getTimetable(id); }

  @Roles('admin')
  @Post()
  create(@Body() body: any) { return this.svc.createTimetable(body); }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateTimetable(id, body);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.deleteTimetable(id); }

  // ─── Generate (Test button) ──────────────────────────────────────

  @Roles('admin')
  @Post(':id/generate')
  generate(@Param('id') id: string) { return this.svc.generateTimetable(id); }

  // ─── Subjects ────────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/subjects')
  createSubject(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.createSubject(timetableId, body);
  }

  @Roles('admin')
  @Put('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateSubject(id, body);
  }

  @Roles('admin')
  @Delete('subjects/:id')
  deleteSubject(@Param('id') id: string) { return this.svc.deleteSubject(id); }

  // ─── Classes ─────────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/classes')
  createClass(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.createClass(timetableId, body);
  }

  @Roles('admin')
  @Put('classes/:id')
  updateClass(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateClass(id, body);
  }

  @Roles('admin')
  @Delete('classes/:id')
  deleteClass(@Param('id') id: string) { return this.svc.deleteClass(id); }

  // ─── Classrooms ──────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/classrooms')
  createClassroom(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.createClassroom(timetableId, body);
  }

  @Roles('admin')
  @Put('classrooms/:id')
  updateClassroom(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateClassroom(id, body);
  }

  @Roles('admin')
  @Delete('classrooms/:id')
  deleteClassroom(@Param('id') id: string) { return this.svc.deleteClassroom(id); }

  // ─── Teachers ────────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/teachers')
  createTeacher(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.createTeacher(timetableId, body);
  }

  @Roles('admin')
  @Put('teachers/:id')
  updateTeacher(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateTeacher(id, body);
  }

  @Roles('admin')
  @Delete('teachers/:id')
  deleteTeacher(@Param('id') id: string) { return this.svc.deleteTeacher(id); }

  // ─── Lessons ─────────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/lessons')
  createLesson(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.createLesson(timetableId, body);
  }

  @Roles('admin')
  @Put('lessons/:id')
  updateLesson(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateLesson(id, body);
  }

  @Roles('admin')
  @Delete('lessons/:id')
  deleteLesson(@Param('id') id: string) { return this.svc.deleteLesson(id); }

  // ─── Entries ─────────────────────────────────────────────────────

  @Roles('admin')
  @Post(':id/entries')
  upsertEntry(@Param('id') timetableId: string, @Body() body: any) {
    return this.svc.upsertEntry(timetableId, body);
  }

  @Roles('admin')
  @Delete('entries/:id')
  deleteEntry(@Param('id') id: string) { return this.svc.deleteEntry(id); }

  // ─── Teacher Attendance ──────────────────────────────────────────

  @Post('teacher-attendance/scan')
  scanQr(@Body() body: { qrCode: string; period: number }) {
    return this.svc.markTeacherAttendanceByQr(body.qrCode, body.period);
  }

  @Roles('admin')
  @Post('teacher-attendance/mark')
  markAttendance(@Body() body: { teacherId: string; date: string; period: number; status: string }) {
    return this.svc.markTeacherAttendance(body.teacherId, body.date, body.period, body.status);
  }

  @Roles('admin')
  @Get(':id/teacher-attendance')
  getTeacherReport(
    @Param('id') timetableId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.svc.getTeacherAttendanceReport(timetableId, startDate, endDate);
  }
}
