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

  /** Restore from a previously-exported JSON payload. WIPES existing data. */
  @Post('import')
  async import(@Body() body: any) {
    return this.backup.restore(body);
  }
}
