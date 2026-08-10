import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { SchoolsService } from './schools.service';

@Controller('platform/schools')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class SchoolsController {
  constructor(private schools: SchoolsService) {}

  @Get()
  list() {
    return this.schools.list();
  }

  @Get('check-subdomain')
  checkSubdomain(@Query('slug') slug: string) {
    return this.schools.checkSubdomainAvailable(slug);
  }

  @Get('stats')
  stats() {
    return this.schools.stats();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.schools.getOne(id);
  }

  @Post()
  create(@Body() body: { name: string; subdomain: string; adminName: string; adminEmail: string; adminPhone?: string }) {
    return this.schools.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; status?: string }) {
    return this.schools.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() body: { confirmName: string }) {
    return this.schools.remove(id, body?.confirmName || '');
  }

  @Post(':id/impersonate')
  impersonate(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.schools.impersonate(req.user.userId, id, body?.reason || '');
  }

  @Post(':id/impersonate/end')
  endImpersonation(@Param('id') id: string, @Request() req: any) {
    return this.schools.endImpersonation(req.user.userId, id);
  }

  @Post(':id/reset-admin-password')
  resetAdminPassword(@Param('id') id: string, @Body() body: { reason: string }, @Request() req: any) {
    return this.schools.resetAdminPassword(req.user.userId, id, body?.reason || '');
  }

  @Post(':id/retry-domain')
  retryDomainProvisioning(@Param('id') id: string) {
    return this.schools.retryDomainProvisioning(id);
  }
}
