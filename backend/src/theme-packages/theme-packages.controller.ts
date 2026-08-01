import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { ThemePackagesService } from './theme-packages.service';

@Controller('platform/theme-packages')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class ThemePackagesController {
  constructor(private themePackages: ThemePackagesService) {}

  @Post(':addonId')
  upload(@Param('addonId') addonId: string, @Body() body: { css: string }) {
    return this.themePackages.applyToAddon(addonId, body?.css || '');
  }
}
