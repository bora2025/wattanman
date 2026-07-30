import { Controller, Get, Post, Put, Patch, Body, Query, Param, Delete, UseInterceptors, UploadedFile, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequiresAddonGuard } from '../school-addons/requires-addon.guard';
import { RequiresAddon, SkipAddonCheck } from '../school-addons/requires-addon.decorator';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard, RequiresAddonGuard)
@RequiresAddon('CLASSES')
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post()
  async createClass(@Body() data: { name: string; subject?: string; teacherId: string; classAdminId?: string; schedule?: string; studyYearId?: string; registrationStatus?: string; thumbnail?: string; description?: string; price?: number | null; showPrice?: boolean }) {
    return this.classesService.createClass(data);
  }

  /**
   * Listing classes is exempt from @RequiresAddon('CLASSES') — it's the
   * grouping mechanism the "Student Portal" (core, never-gated people
   * management — admin/students/page.tsx) uses to pick which roster to view,
   * and the prerequisite lookup for Attendance/Exams/Gradebook/Reports.
   * Only actually creating/editing/deleting a class (the real "class
   * management" feature) stays gated below.
   */
  @SkipAddonCheck()
  @Get()
  async getClasses(
    @Request() req: any,
    @Query('teacherId') teacherId?: string,
    @Query('studyYearId') studyYearId?: string,
  ) {
    // CLASS_ADMIN always sees only classes assigned to them
    if (req?.user?.role === 'CLASS_ADMIN') {
      return this.classesService.getClassesByAdmin(req.user.userId, studyYearId);
    }
    // Alias 'me' resolves to the current user's id (useful for teachers)
    const resolvedTeacherId = teacherId === 'me' ? req?.user?.userId : teacherId;
    return this.classesService.getClasses(resolvedTeacherId, studyYearId);
  }

  /**
   * "Which classes am I in / do I teach" — a roster/identity lookup, not
   * class management, so it's deliberately exempt from @RequiresAddon('CLASSES')
   * above. Attendance, Exams, Gradebook, and Reports for teachers/class-admins
   * all resolve this first before doing anything module-specific; gating it
   * meant disabling Classes broke those other, independently-enabled modules.
   * Always scoped to the caller — never accepts an id for someone else.
   */
  @SkipAddonCheck()
  @Get('mine')
  async getMyClasses(@Request() req: any, @Query('studyYearId') studyYearId?: string) {
    if (req?.user?.role === 'CLASS_ADMIN') {
      return this.classesService.getClassesByAdmin(req.user.userId, studyYearId);
    }
    return this.classesService.getClasses(req?.user?.userId, studyYearId);
  }

  @SkipAddonCheck()
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Get('parents')
  async listParents() {
    return this.classesService.listParents();
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Put(':id')
  async updateClass(@Param('id') id: string, @Body() data: { name?: string; subject?: string; teacherId?: string; classAdminId?: string | null; schedule?: string; studyYearId?: string; registrationStatus?: string; thumbnail?: string; description?: string; price?: number | null; showPrice?: boolean }) {
    return this.classesService.updateClass(id, data);
  }

  // ─── Roster reads (shared with Attendance/Exams/Gradebook, stay ungated) ──

  @SkipAddonCheck()
  @Get(':id/students')
  async getStudentsInClass(@Param('id') classId: string) {
    return this.classesService.getStudentsInClass(classId);
  }

  /**
   * Batch endpoint: fetch students for many classes in one round-trip.
   * Query: ?ids=classId1,classId2,...
   * Returns: { [classId]: Student[] }
   */
  @SkipAddonCheck()
  @Get('students/batch')
  async getStudentsByClasses(@Query('ids') ids?: string) {
    const classIds = (ids || '').split(',').map(s => s.trim()).filter(Boolean);
    return this.classesService.getStudentsByClasses(classIds);
  }

  // ─── Student Portal (Phase 11 — genuinely people-management, not shared
  // with any other module, so it gets its own gate) ──────────────────────────

  @RequiresAddon('STUDENT_PORTAL')
  @Roles('ADMIN', 'CLASS_ADMIN', 'TEACHER')
  @Patch(':classId/students/:studentId')
  async updateStudent(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() data: { name?: string; nameKh?: string; sex?: string; phone?: string; photo?: string; dateOfBirth?: string; address?: string; generation?: string; studentNumber?: string; parentId?: string | null; customFieldValues?: Record<string, string> },
  ) {
    return this.classesService.updateStudent(studentId, data);
  }

  @RequiresAddon('STUDENT_PORTAL')
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post(':id/students')
  async addStudentToClass(@Param('id') classId: string, @Body() data: { studentId: string }) {
    return this.classesService.addStudentToClass(classId, data.studentId);
  }

  @RequiresAddon('STUDENT_PORTAL')
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post(':id/students/bulk-csv')
  @UseInterceptors(FileInterceptor('file'))
  async bulkAddStudentsFromCsv(@Param('id') classId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    return this.classesService.bulkAddStudentsFromCsv(classId, file.buffer);
  }

  // ─── Class management (the actual CLASSES-gated feature) ──────────────────

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Delete(':id')
  async deleteClass(@Param('id') id: string) {
    return this.classesService.deleteClass(id);
  }

  @RequiresAddon('STUDENT_PORTAL')
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post('cleanup-orphaned-students')
  async cleanupOrphanedStudents() {
    return this.classesService.cleanupOrphanedStudents();
  }

  @RequiresAddon('STUDENT_PORTAL')
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Delete(':id/students/:studentId')
  async removeStudentFromClass(@Param('id') classId: string, @Param('studentId') studentId: string) {
    return this.classesService.removeStudentFromClass(classId, studentId);
  }

  @RequiresAddon('STUDENT_PORTAL')
  @Get(':id/available-students')
  async getAvailableStudents(@Param('id') classId: string) {
    return this.classesService.getAvailableStudents(classId);
  }
}