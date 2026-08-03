import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ExtensionRuntimeService } from './extension-runtime.service';

@Controller('extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExtensionRuntimeController {
  constructor(private runtime: ExtensionRuntimeService) {}

  @Get('navigation')
  navigation(@Request() req) { return this.runtime.navigation(req.user); }

  @Get(':extensionKey/pages/:pageKey')
  page(@Param('extensionKey') extensionKey: string, @Param('pageKey') pageKey: string, @Request() req) {
    return this.runtime.page(extensionKey, pageKey, req.user);
  }

  @Get(':extensionKey/resources/:resource')
  records(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Request() req) {
    return this.runtime.records(extensionKey, resource, req.user);
  }

  @Post(':extensionKey/resources/:resource')
  create(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Body() body: Record<string, unknown>, @Request() req) {
    return this.runtime.createRecord(extensionKey, resource, body, req.user);
  }

  @Patch(':extensionKey/resources/:resource/:recordId')
  update(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Param('recordId') recordId: string, @Body() body: Record<string, unknown>, @Request() req) {
    return this.runtime.updateRecord(extensionKey, resource, recordId, body, req.user);
  }

  @Delete(':extensionKey/resources/:resource/:recordId')
  remove(@Param('extensionKey') extensionKey: string, @Param('resource') resource: string, @Param('recordId') recordId: string, @Request() req) {
    return this.runtime.deleteRecord(extensionKey, resource, recordId, req.user);
  }
}
