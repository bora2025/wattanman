import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { AddonPackagesService } from './addon-packages.service';

@Controller('platform/addon-packages')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class AddonPackagesController {
  constructor(private addonPackages: AddonPackagesService) {}

  @Post(':addonId')
  upload(@Param('addonId') addonId: string, @Body() body: { screenshotUrl?: string; detailDescription?: string }) {
    return this.addonPackages.applyToAddon(addonId, body || {});
  }
}
