import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Throttle } from '@nestjs/throttler';
import { ExtensionRuntimeService } from './extension-runtime.service';
import { ExtensionPlatformGuard } from './extension-platform.guard';

@Controller('extensions')
@UseGuards(JwtAuthGuard, RolesGuard, ExtensionPlatformGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class ExtensionRuntimeController {
  constructor(private runtime: ExtensionRuntimeService) {}

  @Get('navigation')
  navigation(@Request() req) { return this.runtime.navigation(req.user); }

  @Get(':extensionKey/pages/:pageKey')
  page(@Param('extensionKey') extensionKey: string, @Param('pageKey') pageKey: string, @Request() req) {
    return this.runtime.page(extensionKey, pageKey, req.user);
  }

  @Get(':extensionKey/resources/:resource')
  records(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Request() req, @Query('cursor') cursor?: string, @Query('limit') limit?: string, @Query('filters') filters?: string) {
    return this.runtime.records(extensionKey, resource, req.user, cursor, limit, filters);
  }

  @Get(':extensionKey/resources/:resource/export')
  exportRecords(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Request() req) {
    return this.runtime.exportRecords(extensionKey, resource, req.user);
  }

  @Post(':extensionKey/resources/:resource')
  create(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Body() body: Record<string, unknown>, @Request() req) {
    return this.runtime.createRecord(extensionKey, resource, body, req.user);
  }

  @Patch(':extensionKey/resources/:resource/:recordId')
  update(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Param('recordId') recordId: string, @Body() body: Record<string, unknown>, @Headers('if-match') ifMatch: string | undefined, @Request() req) {
    return this.runtime.updateRecord(extensionKey, resource, recordId, body, req.user, ifMatch);
  }

  @Delete(':extensionKey/resources/:resource/:recordId')
  remove(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Param('recordId') recordId: string, @Headers('if-match') ifMatch: string | undefined, @Request() req) {
    return this.runtime.deleteRecord(extensionKey, resource, recordId, req.user, ifMatch);
  }
}
