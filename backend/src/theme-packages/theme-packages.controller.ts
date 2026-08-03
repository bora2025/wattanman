import { BadRequestException, Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post(':addonId/zip')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  uploadZip(@Param('addonId') addonId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A theme package .zip file is required');
    return this.themePackages.applyZipToAddon(addonId, file);
  }
}
