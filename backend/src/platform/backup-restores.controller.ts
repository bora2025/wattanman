import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
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

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { reason: string }, @Request() request: any) {
    return this.backups.approveRestore(id, body?.reason, request.user);
  }
}
