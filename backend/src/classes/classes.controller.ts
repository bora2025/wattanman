import { Controller, Get, Post, Put, Patch, Body, Query, Param, Delete, UseInterceptors, UploadedFile, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  @Roles('ADMIN')
  @Post()
  async createClass(@Body() data: { name: string; subject?: string; teacherId: string; schedule?: string; studyYearId?: string }) {
    return this.classesService.createClass(data);
  }

  @Get()
  async getClasses(@Query('teacherId') teacherId?: string, @Query('studyYearId') studyYearId?: string) {
    return this.classesService.getClasses(teacherId, studyYearId);
  }

  @Roles('ADMIN')
  @Put(':id')
  async updateClass(@Param('id') id: string, @Body() data: { name?: string; subject?: string; teacherId?: string; schedule?: string; studyYearId?: string }) {
    return this.classesService.updateClass(id, data);
  }

  @Get(':id/students')
  async getStudentsInClass(@Param('id') classId: string) {
    return this.classesService.getStudentsInClass(classId);
  }

  @Patch(':classId/students/:studentId')
  async updateStudent(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() data: { name?: string; sex?: string; phone?: string; photo?: string; dateOfBirth?: string; address?: string; generation?: string; studentNumber?: string },
  ) {
    return this.classesService.updateStudent(studentId, data);
  }

  @Post(':id/students')
  async addStudentToClass(@Param('id') classId: string, @Body() data: { studentId: string }) {
    return this.classesService.addStudentToClass(classId, data.studentId);
  }

  @Post(':id/students/bulk-csv')
  @UseInterceptors(FileInterceptor('file'))
  async bulkAddStudentsFromCsv(@Param('id') classId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    return this.classesService.bulkAddStudentsFromCsv(classId, file.buffer);
  }

  @Roles('ADMIN')
  @Delete(':id')
  async deleteClass(@Param('id') id: string) {
    return this.classesService.deleteClass(id);
  }

  @Roles('ADMIN')
  @Post('cleanup-orphaned-students')
  async cleanupOrphanedStudents() {
    return this.classesService.cleanupOrphanedStudents();
  }

  @Delete(':id/students/:studentId')
  async removeStudentFromClass(@Param('id') classId: string, @Param('studentId') studentId: string) {
    return this.classesService.removeStudentFromClass(classId, studentId);
  }

  @Get(':id/available-students')
  async getAvailableStudents(@Param('id') classId: string) {
    return this.classesService.getAvailableStudents(classId);
  }
}