import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { ExtensionInstallationsService } from './extension-installations.service';

@Controller('platform/extension-installations')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class PlatformExtensionInstallationsController {
  constructor(private installations: ExtensionInstallationsService) {}

  @Get()
  list(@Query('schoolId') schoolId?: string) {
    return this.installations.platformInstallations(schoolId);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Request() req) {
    return this.installations.approve(id, req.user);
  }

  @Post(':id/install')
  install(@Param('id') id: string, @Body() body: { versionId: string }, @Request() req) {
    return this.installations.install(id, body.versionId, req.user);
  }

  @Post(':id/upgrade')
  upgrade(@Param('id') id: string, @Body() body: { versionId: string; acknowledgePermissions?: boolean }, @Request() req) {
    return this.installations.upgrade(id, body.versionId, req.user, body.acknowledgePermissions === true);
  }

  @Get(':id/upgrades/:versionId/review')
  upgradeReview(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.installations.upgradeReview(id, versionId);
  }

  @Post(':id/rollback')
  rollback(@Param('id') id: string, @Request() req) {
    return this.installations.rollback(id, req.user);
  }

  @Patch(':id/update-policy')
  updatePolicy(@Param('id') id: string, @Body() body: { policy: string }, @Request() req) {
    return this.installations.setUpdatePolicy(id, body.policy, req.user);
  }

  @Patch(':id/activation')
  activate(@Param('id') id: string, @Body() body: { enabled: boolean }, @Request() req) {
    return this.installations.activate(id, body.enabled, req.user);
  }

  @Post(':id/uninstall')
  uninstall(@Param('id') id: string, @Request() req) {
    return this.installations.uninstall(id, req.user);
  }
}

@Controller('extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class SchoolExtensionsController {
  constructor(private installations: ExtensionInstallationsService) {}

  @Get('directory')
  directory() {
    return this.installations.schoolDirectory();
  }

  @Get('installations')
  list() {
    return this.installations.schoolInstallations();
  }

  @Post(':extensionId/request')
  request(@Param('extensionId') extensionId: string, @Request() req) {
    return this.installations.request(extensionId, req.user);
  }

  @Patch('installations/:id/update-policy')
  updatePolicy(@Param('id') id: string, @Body() body: { policy: string }, @Request() req) {
    return this.installations.setUpdatePolicy(id, body.policy, req.user);
  }
}
