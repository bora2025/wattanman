import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupService } from '../backup/backup.service';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';

@Controller('platform/backup-restores')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class BackupRestoresController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  list() { return this.backups.listRestores(); }

  @Get('daily-policy')
  dailyPolicy() { return this.backups.dailyPolicyStatus(); }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { reason: string }, @Request() request: any) {
    return this.backups.approveRestore(id, body?.reason, request.user);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Body() body: { confirmSchoolId: string; changeTicket: string }, @Request() request: any) {
    return this.backups.submitRestoreExecution(id, body, request.user);
  }

  @Get('legal-holds/list')
  holds(@Query('schoolId') schoolId?: string, @Query('active') active?: string) { return this.backups.listLegalHolds({ schoolId, active }); }

  @Post('legal-holds')
  createHold(@Body() body: any, @Request() request: any) { return this.backups.createLegalHold(body, request.user); }

  @Post('legal-holds/:id/release')
  releaseHold(@Param('id') id: string, @Body() body: { reason: string }, @Request() request: any) { return this.backups.releaseLegalHold(id, body?.reason, request.user); }
}
