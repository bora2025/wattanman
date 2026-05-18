import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private svc: AssignmentsService) {}

  @Roles('ADMIN', 'TEACHER')
  @Get()
  getAll(@Query('classId') classId?: string, @Query('status') status?: string) {
    return this.svc.getAll(classId, status);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('my-assignments')
  getByTeacher(@Request() req: any) { return this.svc.getByTeacher(req.user.userId); }

  @Roles('ADMIN', 'TEACHER')
  @Get(':id')
  getOne(@Param('id') id: string) { return this.svc.getOne(id); }

  @Roles('ADMIN', 'TEACHER')
  @Post()
  create(@Body() body: any, @Request() req: any) { return this.svc.create(body, req.user.userId); }

  @Roles('ADMIN', 'TEACHER')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }

  @Roles('ADMIN', 'TEACHER')
  @Delete(':id')
  delete(@Param('id') id: string) { return this.svc.delete(id); }

  // ── Grading ──
  @Roles('ADMIN', 'TEACHER')
  @Patch('submissions/:id/grade')
  grade(@Param('id') id: string, @Body() body: { marks: number; feedback?: string }) {
    return this.svc.gradeSubmission(id, body);
  }

  // ── Student ──
  @Roles('STUDENT', 'ADMIN')
  @Get('student/my-assignments')
  getStudentAssignments(@Request() req: any) { return this.svc.getStudentAssignments(req.user.userId); }

  @Roles('STUDENT', 'ADMIN')
  @Post(':id/submit')
  submit(@Param('id') id: string, @Request() req: any, @Body() body: any) {
    return this.svc.submitAssignment(id, req.user.userId, body);
  }
}
