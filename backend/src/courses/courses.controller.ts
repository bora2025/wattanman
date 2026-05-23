import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private svc: CoursesService) {}

  // ── Listing & detail ────────────────────────────────────────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Get()
  list(
    @Request() req: any,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list({
      teacherUserId: req.user.userId,
      role: req.user.role,
      classId,
      status,
    });
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  // ── Course CRUD ─────────────────────────────────────────────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.userId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.userId, req.user.role);
  }

  // ── State transition (DRAFT → PUBLISHED → … → ARCHIVED) ────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Patch(':id/status')
  transition(
    @Param('id') id: string,
    @Body() body: { status: string },
    @Request() req: any,
  ) {
    return this.svc.transition(id, body?.status, req.user.userId, req.user.role);
  }

  // ── Enrollments ─────────────────────────────────────────────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Get(':id/enrollments')
  listEnrollments(@Param('id') id: string, @Request() req: any) {
    return this.svc.listEnrollments(id, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Post(':id/enrollments')
  enroll(
    @Param('id') id: string,
    @Body() body: { studentId: string },
    @Request() req: any,
  ) {
    return this.svc.enrollStudent(
      id,
      body?.studentId,
      req.user.userId,
      req.user.role,
    );
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Delete(':id/enrollments/:studentId')
  unenroll(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Request() req: any,
  ) {
    return this.svc.unenrollStudent(id, studentId, req.user.userId, req.user.role);
  }

  // ── Lessons ─────────────────────────────────────────────────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER', 'STUDENT')
  @Get(':id/lessons')
  listLessons(@Param('id') id: string) {
    return this.svc.listLessons(id);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Post(':id/lessons')
  createLesson(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.createLesson(id, body, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Put('lessons/:lessonId')
  updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.svc.updateLesson(lessonId, body, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Delete('lessons/:lessonId')
  deleteLesson(@Param('lessonId') lessonId: string, @Request() req: any) {
    return this.svc.deleteLesson(lessonId, req.user.userId, req.user.role);
  }

  // ── Lesson pages ────────────────────────────────────────────────────
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER', 'STUDENT')
  @Get('lessons/:lessonId/pages')
  listPages(@Param('lessonId') lessonId: string) {
    return this.svc.listPages(lessonId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Post('lessons/:lessonId/pages')
  createPage(
    @Param('lessonId') lessonId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.svc.createPage(lessonId, body, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Put('pages/:pageId')
  updatePage(
    @Param('pageId') pageId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.svc.updatePage(pageId, body, req.user.userId, req.user.role);
  }

  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  @Delete('pages/:pageId')
  deletePage(@Param('pageId') pageId: string, @Request() req: any) {
    return this.svc.deletePage(pageId, req.user.userId, req.user.role);
  }

  // ── Student-facing list ─────────────────────────────────────────────
  @Roles('STUDENT', 'ADMIN', 'SUPER_ADMIN')
  @Get('student/my-courses')
  studentCourses(@Request() req: any) {
    return this.svc.getStudentCourses(req.user.userId);
  }
}
