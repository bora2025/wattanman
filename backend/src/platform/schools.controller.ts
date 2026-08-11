import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
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
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('status') status?: string) {
    return this.schools.list({ cursor, limit, search, status });
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
  create(@Body() body: { name: string; subdomain: string; adminName: string; adminEmail: string; adminPhone?: string }, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.schools.create(body, idempotencyKey);
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

  @Get(':id/domains')
  listDomains(@Param('id') id: string) {
    return this.schools.listDomains(id);
  }

  @Post(':id/domains')
  registerDomain(@Param('id') id: string, @Body() body: { hostname: string }) {
    return this.schools.registerDomain(id, body?.hostname || '');
  }

  @Post(':id/domains/:domainId/verify')
  verifyDomain(@Param('id') id: string, @Param('domainId') domainId: string) {
    return this.schools.verifyDomain(id, domainId);
  }

  @Post(':id/domains/:domainId/retry-routing')
  retryDomainRouting(@Param('id') id: string, @Param('domainId') domainId: string) {
    return this.schools.retryDomainRouting(id, domainId);
  }
}
