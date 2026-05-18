import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { ParentService } from './parent.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('parent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentController {
  constructor(private svc: ParentService) {}

  @Roles('PARENT', 'ADMIN')
  @Get('children')
  getChildren(@Request() req: any) { return this.svc.getChildren(req.user.userId); }

  @Roles('PARENT', 'ADMIN')
  @Get('children/:studentId/attendance')
  getAttendance(
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getChildAttendance(studentId, from, to);
  }

  @Roles('PARENT', 'ADMIN')
  @Get('children/:studentId/grades')
  getGrades(@Param('studentId') studentId: string) { return this.svc.getChildGrades(studentId); }

  @Roles('PARENT', 'ADMIN')
  @Get('children/:studentId/fees')
  getFees(@Param('studentId') studentId: string) { return this.svc.getChildFees(studentId); }
}
