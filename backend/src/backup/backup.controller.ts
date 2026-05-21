import { Body, Controller, Get, Header, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('backup')
export class BackupController {
  constructor(private backup: BackupService) {}

  /** Download a JSON file containing every row of every table. */
  @Get('export')
  async export(@Res() res: Response) {
    const data = await this.backup.exportAll();
    const filename = `wattaman-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  /** Restore from a previously-exported JSON payload. WIPES existing data. */
  @Post('import')
  async import(@Body() body: any) {
    return this.backup.restore(body);
  }
}
