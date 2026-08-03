import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { ExtensionsService } from './extensions.service';
import { ExtensionAlertService } from './extension-alert.service';

@Controller('platform/extensions')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class ExtensionsController {
  constructor(private extensions: ExtensionsService, private alerts: ExtensionAlertService) {}

  @Get()
  list() {
    return this.extensions.list();
  }

  @Get('publishers')
  publishers() {
    return this.extensions.publishers();
  }

  @Patch('publishers/:publisherId/status')
  publisherStatus(@Param('publisherId') publisherId: string, @Body() body: { status: string }, @Request() req) {
    return this.extensions.setPublisherStatus(publisherId, body.status, req.user);
  }

  @Patch('publishers/:publisherId/members/:userId')
  publisherMemberRoles(
    @Param('publisherId') publisherId: string,
    @Param('userId') userId: string,
    @Body() body: { roles: string[] },
    @Request() req,
  ) {
    return this.extensions.setPublisherMemberRoles(publisherId, userId, body.roles, req.user);
  }

  @Get('publishers/:publisherId/signing-keys')
  signingKeys(@Param('publisherId') publisherId: string) {
    return this.extensions.signingKeys(publisherId);
  }

  @Post('publishers/:publisherId/signing-keys')
  registerSigningKey(@Param('publisherId') publisherId: string, @Body() body: { keyId?: string; publicKeyPem?: string }, @Request() req) {
    return this.extensions.registerSigningKey(publisherId, body, req.user);
  }

  @Patch('signing-keys/:keyId/status')
  signingKeyStatus(@Param('keyId') keyId: string, @Body() body: { status: string }, @Request() req) {
    return this.extensions.setSigningKeyStatus(keyId, body.status, req.user);
  }

  @Get('health')
  health() {
    return this.extensions.health();
  }

  @Get('alerts')
  alertsList() {
    return this.alerts.list();
  }

  @Post('alerts/scan')
  scanAlerts() {
    return this.alerts.scan();
  }

  @Patch('alerts/:alertId/status')
  alertStatus(@Param('alertId') alertId: string, @Body() body: { status: string }, @Request() req) {
    return this.alerts.setStatus(alertId, body.status, req.user?.userId);
  }

  @Post()
  create(@Body() body: { key: string; name: string; description?: string; runtimeType: string; commercialType: string; category?: string }, @Request() req) {
    return this.extensions.createExtension(body, req.user);
  }

  @Post(':extensionId/versions')
  createVersion(@Param('extensionId') extensionId: string, @Body() body: { version: string; manifest: Record<string, unknown>; manifestSchema?: number; compatibilityRange?: string; releaseNotes?: string }, @Request() req) {
    return this.extensions.createVersion(extensionId, body, req.user);
  }

  @Patch('versions/:versionId')
  updateDraft(@Param('versionId') versionId: string, @Body() body: { manifest?: Record<string, unknown>; compatibilityRange?: string | null; releaseNotes?: string | null }, @Request() req) {
    return this.extensions.updateDraft(versionId, body, req.user);
  }

  @Post('versions/:versionId/package')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadPackage(@Param('versionId') versionId: string, @UploadedFile() file: Express.Multer.File | undefined, @Request() req) {
    if (!file) throw new BadRequestException('An extension package .zip file is required');
    return this.extensions.uploadPackage(versionId, file, req.user);
  }

  @Post('versions/:versionId/transition')
  transition(@Param('versionId') versionId: string, @Body() body: { status: string; reviewNotes?: string }, @Request() req) {
    return this.extensions.transition(versionId, body.status, body.reviewNotes, req.user);
  }

  @Get('versions/:versionId/validations')
  validations(@Param('versionId') versionId: string) {
    return this.extensions.validationReports(versionId);
  }

  @Get('versions/:versionId/review')
  review(@Param('versionId') versionId: string) {
    return this.extensions.reviewSummary(versionId);
  }

  @Get('versions/:versionId/reviews')
  reviewHistory(@Param('versionId') versionId: string) {
    return this.extensions.reviewHistory(versionId);
  }

  @Post('versions/:versionId/appeal')
  appeal(@Param('versionId') versionId: string, @Body() body: { notes?: string }, @Request() req) {
    return this.extensions.appeal(versionId, body.notes, req.user);
  }

  @Get('versions/:versionId/preview')
  preview(@Param('versionId') versionId: string) {
    return this.extensions.themePreview(versionId);
  }
}
