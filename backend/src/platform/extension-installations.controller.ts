import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PlatformScopeGuard } from "../tenancy/platform-scope.guard";
import { ExtensionInstallationsService } from "./extension-installations.service";
import { ExtensionPlatformGuard } from "./extension-platform.guard";
import { RequireIdempotencyKey } from "../security/require-idempotency-key.decorator";
import { ExtensionLifecycleJobsService } from "./extension-lifecycle-jobs.service";

@Controller("platform/extension-installations")
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard, ExtensionPlatformGuard)
@Roles("PLATFORM_ADMIN")
export class PlatformExtensionInstallationsController {
  constructor(
    private installations: ExtensionInstallationsService,
    private lifecycleJobs: ExtensionLifecycleJobsService,
  ) {}

  @Get()
  list(@Query("schoolId") schoolId?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.installations.platformInstallations({ schoolId, cursor, limit });
  }

  @Get("pilot-criteria")
  pilotCriteria() {
    return this.installations.pilotAcceptanceCriteria();
  }

  @Get("jobs/:jobId")
  lifecycleJob(@Param("jobId") jobId: string) {
    return this.lifecycleJobs.get(jobId);
  }

  @Get("payment-settings")
  paymentSettings() {
    return this.installations.paymentSettings();
  }

  @Get("payment-settings/history")
  paymentSettingsHistory(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.installations.paymentSettingsHistory({ cursor, limit });
  }

  @Post("payment-settings")
  @UseInterceptors(FileInterceptor("qr", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  updatePaymentSettings(
    @UploadedFile() qr: Express.Multer.File | undefined,
    @Body() body: { bankName?: string; accountName?: string; accountNumber?: string; currency?: string; instructions?: string },
    @Request() req,
  ) {
    return this.installations.updatePaymentSettings(body, qr, req.user);
  }

  @Get("payment-qr")
  async platformPaymentQr(
    @Query("version") version: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const qr = await this.installations.paymentQr(version);
    response.setHeader("Content-Type", qr.contentType);
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(qr.contents);
  }

  @Get(":id/payment-evidence-url")
  paymentEvidenceUrl(@Param("id") id: string, @Request() req) {
    return this.installations.paymentEvidenceDownloadUrl(id, req.user);
  }

  @Patch(":id/payment-evidence-hold")
  paymentEvidenceHold(
    @Param("id") id: string,
    @Body() body: { held?: boolean; reason?: string },
    @Request() req,
  ) {
    return this.installations.setPaymentEvidenceLegalHold(id, body.held === true, body.reason, req.user);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Request() req) {
    return this.installations.approve(id, req.user);
  }

  @Patch(":id/billing")
  billing(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Request() req,
  ) {
    return this.installations.setBillingStatus(id, body.status, req.user);
  }

  @Post(":id/install")
  @RequireIdempotencyKey()
  @HttpCode(202)
  install(
    @Param("id") id: string,
    @Body() body: { versionId: string },
    @Request() req,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.lifecycleJobs.submitInstallation(id, "INSTALL", { versionId: body.versionId }, req.user, idempotencyKey);
  }

  @Post(":id/upgrade")
  @RequireIdempotencyKey()
  @HttpCode(202)
  upgrade(
    @Param("id") id: string,
    @Body() body: { versionId: string; acknowledgePermissions?: boolean },
    @Request() req,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.lifecycleJobs.submitInstallation(
      id,
      "UPGRADE",
      { versionId: body.versionId, acknowledgePermissions: body.acknowledgePermissions === true },
      req.user,
      idempotencyKey,
    );
  }

  @Get(":id/upgrades/:versionId/review")
  upgradeReview(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.installations.upgradeReview(id, versionId);
  }

  @Get(":id/dependencies/:versionId/review")
  dependencyReview(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.installations.dependencyReview(id, versionId);
  }

  @Post(":id/rollback")
  @RequireIdempotencyKey()
  @HttpCode(202)
  rollback(@Param("id") id: string, @Request() req, @Headers("idempotency-key") idempotencyKey: string) {
    return this.lifecycleJobs.submitInstallation(id, "ROLLBACK", {}, req.user, idempotencyKey);
  }

  @Patch(":id/update-policy")
  updatePolicy(
    @Param("id") id: string,
    @Body() body: { policy: string },
    @Request() req,
  ) {
    return this.installations.setUpdatePolicy(id, body.policy, req.user);
  }

  @Patch(":id/activation")
  @RequireIdempotencyKey()
  @HttpCode(202)
  activate(
    @Param("id") id: string,
    @Body() body: { enabled: boolean },
    @Request() req,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.lifecycleJobs.submitInstallation(id, body.enabled ? "ACTIVATE" : "DEACTIVATE", {}, req.user, idempotencyKey);
  }

  @Post(":id/uninstall")
  @RequireIdempotencyKey()
  @HttpCode(202)
  uninstall(@Param("id") id: string, @Request() req, @Headers("idempotency-key") idempotencyKey: string) {
    return this.lifecycleJobs.submitInstallation(id, "UNINSTALL", {}, req.user, idempotencyKey);
  }

  @Post(":id/pilot-feedback")
  pilotFeedback(
    @Param("id") id: string,
    @Body()
    body: {
      outcome?: string;
      rating?: number;
      checklist?: Record<string, boolean>;
      comments?: string;
    },
    @Request() req,
  ) {
    return this.installations.submitPilotFeedback(
      id,
      body,
      req.user,
      "OPERATOR",
    );
  }
}

@Controller("extensions")
@UseGuards(JwtAuthGuard, RolesGuard, ExtensionPlatformGuard)
@Roles("ADMIN", "SUPER_ADMIN")
export class SchoolExtensionsController {
  constructor(
    private installations: ExtensionInstallationsService,
    private lifecycleJobs: ExtensionLifecycleJobsService,
  ) {}

  @Get("directory")
  directory(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("runtimeType") runtimeType?: string,
    @Query("commercialType") commercialType?: string,
    @Query("locale") locale?: string,
    @Query("sort") sort?: string,
  ) {
    return this.installations.schoolDirectory({ cursor, limit, search, category, runtimeType, commercialType, locale, sort });
  }

  @Get("jobs/:jobId")
  lifecycleJob(@Param("jobId") jobId: string) {
    return this.lifecycleJobs.get(jobId);
  }

  @Get("collections")
  collections(@Query("locale") locale?: string) {
    return this.installations.schoolCatalogCollections(locale);
  }

  @Roles(
    "ADMIN",
    "SUPER_ADMIN",
    "TEACHER",
    "STUDENT",
    "PARENT",
    "EMPLOYEE",
    "ACCOUNTER",
    "WATTAMAN",
    "WATTAMAN_REPORTER",
    "CLASS_ADMIN",
  )
  @Get("enabled")
  enabled() {
    return this.installations.enabledExtensionKeys();
  }

  @Get("installations")
  list(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.installations.schoolInstallations({ cursor, limit });
  }

  @Get("pilot-criteria")
  pilotCriteria() {
    return this.installations.pilotAcceptanceCriteria();
  }

  @Get("request-context")
  requestContext(@Request() req) {
    return this.installations.schoolRequestContext(req.user);
  }

  @Get("payment-qr")
  async paymentQr(@Res({ passthrough: true }) response: Response) {
    const qr = await this.installations.paymentQr();
    response.setHeader("Content-Type", qr.contentType);
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(qr.contents);
  }

  @Post(":extensionId/request")
  request(@Param("extensionId") extensionId: string, @Request() req) {
    return this.installations.request(extensionId, req.user);
  }

  @Post(":extensionId/request-payment")
  @UseInterceptors(FileInterceptor("invoice", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  requestPayment(
    @Param("extensionId") extensionId: string,
    @UploadedFile() invoice: Express.Multer.File | undefined,
    @Body() body: { paymentReference?: string; paymentNotes?: string },
    @Request() req,
  ) {
    if (!invoice) throw new BadRequestException("Payment invoice is required");
    return this.installations.requestPaid(extensionId, invoice, body, req.user);
  }

  @Post(":extensionId/payment-evidence/initiate")
  initiatePaymentEvidence(
    @Param("extensionId") extensionId: string,
    @Body() body: {
      fileName?: string;
      contentType?: string;
      size?: number;
      checksum?: string;
      paymentReference?: string;
      paymentNotes?: string;
    },
    @Request() req,
  ) {
    return this.installations.initiatePaymentEvidence(extensionId, body, req.user);
  }

  @Post("installations/:id/payment-evidence/finalize")
  finalizePaymentEvidence(@Param("id") id: string, @Request() req) {
    return this.installations.finalizePaymentEvidence(id, req.user);
  }

  @Patch("installations/:id/update-policy")
  updatePolicy(
    @Param("id") id: string,
    @Body() body: { policy: string },
    @Request() req,
  ) {
    return this.installations.setUpdatePolicy(id, body.policy, req.user);
  }

  @Delete("installations/:id")
  @RequireIdempotencyKey()
  @HttpCode(202)
  removeUninstalled(@Param("id") id: string, @Request() req, @Headers("idempotency-key") idempotencyKey: string) {
    return this.lifecycleJobs.submitInstallation(id, "PURGE_INSTALLATION", {}, req.user, idempotencyKey);
  }

  @Post("installations/:id/pilot-feedback")
  pilotFeedback(
    @Param("id") id: string,
    @Body()
    body: {
      outcome?: string;
      rating?: number;
      checklist?: Record<string, boolean>;
      comments?: string;
    },
    @Request() req,
  ) {
    return this.installations.submitPilotFeedback(
      id,
      body,
      req.user,
      "SCHOOL_ADMIN",
    );
  }
}
