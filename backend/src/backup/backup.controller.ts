import { Body, Controller, Get, Headers, Param, Post, Request, UseGuards } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('backup')
export class BackupController {
  constructor(private backup: BackupService) {}

  @Post('exports')
  requestExport(@Request() req: any, @Headers('idempotency-key') requestKey: string) { return this.backup.requestExport(req.user, requestKey); }

  @Get('exports')
  listExports() { return this.backup.listExports(); }

  @Get('exports/:id')
  getExport(@Param('id') id: string) { return this.backup.getExport(id); }

  @Get('exports/:id/download')
  downloadExport(@Param('id') id: string, @Request() req: any) { return this.backup.downloadExport(id, req.user); }

  @Post('restores')
  requestRestore(@Body() body: { exportId: string }, @Request() req: any, @Headers('idempotency-key') requestKey: string) {
    return this.backup.requestRestore(body?.exportId, req.user, requestKey);
  }

  @Get('restores')
  listRestores() { return this.backup.listRestores(); }

  @Get('restores/:id')
  getRestore(@Param('id') id: string) { return this.backup.getRestore(id); }
}
