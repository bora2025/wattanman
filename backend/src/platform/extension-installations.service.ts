import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { getCurrentSchoolId } from "../tenancy/tenant-context";
import { R2StorageService } from "../storage/r2-storage.service";
import { ExtensionSigningService } from "./extension-signing.service";

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

const PILOT_ACCEPTANCE_CRITERIA = [
  {
    key: "install_without_rebuild",
    label: "Installs from the signed ZIP without a Wattaman rebuild",
  },
  {
    key: "role_navigation",
    label: "Navigation and pages appear only for approved roles",
  },
  { key: "tenant_isolation", label: "School data remains tenant-isolated" },
  {
    key: "core_stability",
    label: "Core startup and workflows remain stable when enabled or disabled",
  },
  {
    key: "upgrade_rollback",
    label: "Upgrade and rollback preserve valid school data",
  },
  {
    key: "operator_runbook",
    label: "Operators can diagnose, disable, and recover the extension",
  },
] as const;

@Injectable()
export class ExtensionInstallationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: R2StorageService,
    private signing: ExtensionSigningService,
  ) {}

  async schoolDirectory() {
    const schoolId = getCurrentSchoolId();
    return this.prisma.extension.findMany({
      where: {
        status: "ACTIVE",
        versions: { some: { lifecycleStatus: "PUBLISHED" } },
        OR: [
          { visibility: "LISTED" },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });
  }

  schoolInstallations() {
    return this.prisma.extensionInstallation.findMany({
      include: { extension: true, installedVersion: true, pilotFeedback: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async schoolRequestContext(actor: Actor) {
    const schoolId = getCurrentSchoolId();
    const [school, admin] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, subdomain: true } }),
      actor.userId
        ? this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, name: true, email: true, phone: true } })
        : null,
    ]);
    if (!school || !admin) throw new NotFoundException("School administrator not found");
    const payment = await this.paymentSettings();
    return { school, admin, payment };
  }

  async paymentSettings() {
    const setting = await this.prisma.extensionPaymentSetting.findUnique({
      where: { id: "default" },
    });
    return setting
      ? {
          bankName: setting.bankName,
          accountName: setting.accountName,
          accountNumber: setting.accountNumber,
          currency: setting.currency,
          instructions: setting.instructions,
          hasQr: !!setting.qrStorageKey,
          updatedAt: setting.updatedAt,
        }
      : { currency: "USD", hasQr: false };
  }

  async updatePaymentSettings(
    data: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currency?: string;
      instructions?: string;
    },
    qrFile: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    if (qrFile && !["image/png", "image/jpeg", "image/webp"].includes(qrFile.mimetype))
      throw new BadRequestException("Bank QR must be a PNG, JPG, or WebP image");
    const existing = await this.prisma.extensionPaymentSetting.findUnique({
      where: { id: "default" },
    });
    let qrStorageKey = existing?.qrStorageKey;
    if (qrFile) {
      qrStorageKey = `billing/payment-qr/${Date.now()}-${qrFile.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await this.storage.putPrivate(qrStorageKey, qrFile.buffer, qrFile.mimetype);
    }
    const setting = await this.prisma.extensionPaymentSetting.upsert({
      where: { id: "default" },
      update: {
        bankName: data.bankName?.trim() || null,
        accountName: data.accountName?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        currency: data.currency?.trim().toUpperCase() || "USD",
        instructions: data.instructions?.trim() || null,
        ...(qrFile
          ? {
              qrStorageKey,
              qrContentType: qrFile.mimetype,
              qrFileName: qrFile.originalname,
            }
          : {}),
        updatedBy: actor.userId,
      },
      create: {
        id: "default",
        bankName: data.bankName?.trim() || null,
        accountName: data.accountName?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        currency: data.currency?.trim().toUpperCase() || "USD",
        instructions: data.instructions?.trim() || null,
        qrStorageKey,
        qrContentType: qrFile?.mimetype,
        qrFileName: qrFile?.originalname,
        updatedBy: actor.userId,
      },
    });
    if (qrFile && existing?.qrStorageKey && existing.qrStorageKey !== qrStorageKey)
      await this.storage.deletePrivate(existing.qrStorageKey).catch(() => undefined);
    await this.log(actor, "PAYMENT_QR_UPDATE", setting.id, "Extension payment settings", {
      bankName: setting.bankName,
      accountName: setting.accountName,
      currency: setting.currency,
    });
    return this.paymentSettings();
  }

  async paymentQr() {
    const setting = await this.prisma.extensionPaymentSetting.findUnique({
      where: { id: "default" },
    });
    if (!setting?.qrStorageKey) throw new NotFoundException("Bank QR is not configured");
    return {
      contents: await this.storage.getPrivate(setting.qrStorageKey),
      contentType: setting.qrContentType || "image/png",
    };
  }

  async enabledExtensionKeys() {
    const installations = await this.prisma.extensionInstallation.findMany({
      where: {
        enabled: true,
        installedAt: { not: null },
        uninstalledAt: null,
        extension: { status: "ACTIVE" },
        installedVersion: {
          lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
        },
      },
      select: { extension: { select: { key: true } } },
    });
    return {
      enabled: installations.map((installation) => installation.extension.key),
    };
  }

  async request(extensionId: string, actor: Actor) {
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: "ACTIVE",
        OR: [
          { visibility: { in: ["LISTED", "UNLISTED"] } },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!extension || !extension.versions[0])
      throw new NotFoundException(
        "No published extension version is available",
      );
    const existing = await this.prisma.extensionInstallation.findFirst({
      where: { extensionId },
    });
    if (existing?.enabled)
      throw new ConflictException(
        "Extension is already active for this school",
      );
    const installation = existing
      ? await this.prisma.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            requestedAt: new Date(),
            requestedBy: actor.userId,
            uninstalledAt: null,
            purgeAfter: null,
          },
        })
      : await this.prisma.extensionInstallation.create({
          data: {
            schoolId,
            extensionId,
            installedVersionId: extension.versions[0].id,
            requestedAt: new Date(),
            requestedBy: actor.userId,
          },
        });
    await this.log(actor, "REQUEST", installation.id, extension.name, {
      extensionId,
      schoolId,
    });
    return installation;
  }

  async requestPaid(
    extensionId: string,
    file: Express.Multer.File,
    data: { paymentReference?: string; paymentNotes?: string },
    actor: Actor,
  ) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.mimetype))
      throw new BadRequestException("Invoice must be a PDF, JPG, or PNG file");
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: "ACTIVE",
        price: { gt: 0 },
        OR: [
          { visibility: { in: ["LISTED", "UNLISTED"] } },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!extension?.versions[0])
      throw new NotFoundException("Paid extension is not available");
    const [school, admin, existing] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      actor.userId
        ? this.prisma.user.findUnique({ where: { id: actor.userId } })
        : null,
      this.prisma.extensionInstallation.findFirst({ where: { extensionId } }),
    ]);
    if (!school || !admin) throw new NotFoundException("School administrator not found");
    if (existing?.enabled)
      throw new ConflictException("Extension is already active for this school");
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `schools/${schoolId}/billing/extensions/${extensionId}/${Date.now()}-${safeName}`;
    await this.storage.putPrivate(storageKey, file.buffer, file.mimetype);
    const requestData = {
      installedVersionId: extension.versions[0].id,
      requestedAt: new Date(),
      requestedBy: actor.userId,
      approvedAt: null,
      approvedBy: null,
      billingStatus: "PENDING",
      requestSchoolName: school.name,
      requestAdminName: admin.name,
      requestAdminEmail: admin.email,
      paymentReference: data.paymentReference?.trim() || null,
      paymentNotes: data.paymentNotes?.trim() || null,
      invoiceStorageKey: storageKey,
      invoiceFileName: safeName,
      invoiceContentType: file.mimetype,
      invoiceUploadedAt: new Date(),
      paymentSubmittedAt: new Date(),
      uninstalledAt: null,
      purgeAfter: null,
    };
    const installation = existing
      ? await this.prisma.extensionInstallation.update({
          where: { id: existing.id },
          data: requestData,
        })
      : await this.prisma.extensionInstallation.create({
          data: { schoolId, extensionId, ...requestData },
        });
    if (existing?.invoiceStorageKey && existing.invoiceStorageKey !== storageKey)
      await this.storage.deletePrivate(existing.invoiceStorageKey).catch(() => undefined);
    await this.log(actor, "PAID_REQUEST", installation.id, extension.name, {
      extensionId,
      schoolId,
      price: extension.price,
      paymentReference: requestData.paymentReference,
    });
    return installation;
  }

  async paymentInvoice(installationId: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: installationId },
      select: { invoiceStorageKey: true, invoiceFileName: true, invoiceContentType: true },
    });
    if (!installation?.invoiceStorageKey)
      throw new NotFoundException("Payment invoice not found");
    return {
      contents: await this.storage.getPrivate(installation.invoiceStorageKey),
      fileName: installation.invoiceFileName || "invoice",
      contentType: installation.invoiceContentType || "application/octet-stream",
    };
  }

  platformInstallations(schoolId?: string) {
    return this.prisma.extensionInstallation.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: {
        school: true,
        extension: {
          include: {
            versions: {
              where: { lifecycleStatus: "PUBLISHED" },
              orderBy: { publishedAt: "desc" },
            },
          },
        },
        installedVersion: true,
        pilotFeedback: { orderBy: { updatedAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  pilotAcceptanceCriteria() {
    return PILOT_ACCEPTANCE_CRITERIA;
  }

  async submitPilotFeedback(
    installationId: string,
    data: {
      outcome?: string;
      rating?: number;
      checklist?: Record<string, boolean>;
      comments?: string;
    },
    actor: Actor,
    source: "SCHOOL_ADMIN" | "OPERATOR",
  ) {
    const installation = await this.requireInstallationSummary(installationId);
    if (!installation.installedAt)
      throw new ConflictException(
        "Pilot feedback requires an installed extension",
      );
    if (!["ACCEPTED", "NEEDS_WORK", "BLOCKED"].includes(data.outcome || ""))
      throw new BadRequestException(
        "outcome must be ACCEPTED, NEEDS_WORK, or BLOCKED",
      );
    if (
      !Number.isInteger(data.rating) ||
      Number(data.rating) < 1 ||
      Number(data.rating) > 5
    )
      throw new BadRequestException("rating must be an integer from 1 to 5");
    const checklist = data.checklist || {};
    const unknown = Object.keys(checklist).filter(
      (key) =>
        !PILOT_ACCEPTANCE_CRITERIA.some((criterion) => criterion.key === key),
    );
    const missing = PILOT_ACCEPTANCE_CRITERIA.filter(
      (criterion) => typeof checklist[criterion.key] !== "boolean",
    );
    if (unknown.length || missing.length)
      throw new BadRequestException(
        "checklist must contain every published pilot acceptance criterion and no unknown keys",
      );
    if (
      data.outcome === "ACCEPTED" &&
      PILOT_ACCEPTANCE_CRITERIA.some(
        (criterion) => checklist[criterion.key] !== true,
      )
    ) {
      throw new BadRequestException(
        "Every acceptance criterion must pass before feedback can be ACCEPTED",
      );
    }
    const comments = data.comments?.trim();
    if (data.outcome !== "ACCEPTED" && !comments)
      throw new BadRequestException(
        "comments are required when pilot feedback is not accepted",
      );
    const feedback = await this.prisma.extensionPilotFeedback.upsert({
      where: { installationId_source: { installationId, source } },
      update: {
        outcome: data.outcome,
        rating: data.rating,
        checklist,
        comments: comments || null,
        actorId: actor.userId,
        actorRole: actor.role,
      },
      create: {
        installationId,
        schoolId: installation.schoolId,
        source,
        outcome: data.outcome!,
        rating: data.rating!,
        checklist,
        comments: comments || null,
        actorId: actor.userId,
        actorRole: actor.role,
      },
    });
    await this.log(
      actor,
      "PILOT_FEEDBACK",
      installation.id,
      installation.extension.name,
      {
        schoolId: installation.schoolId,
        extensionId: installation.extensionId,
        source,
        outcome: data.outcome,
        rating: data.rating,
      },
    );
    return feedback;
  }

  async approve(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.requestedAt)
      throw new ConflictException("School has not requested this extension");
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { approvedAt: new Date(), approvedBy: actor.userId },
    });
    await this.log(actor, "APPROVE", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
    });
    return updated;
  }

  async setBillingStatus(installationId: string, status: string, actor: Actor) {
    const allowed = ["PENDING", "ACTIVE", "OVERDUE", "CANCELLED"];
    if (!allowed.includes(status))
      throw new BadRequestException(`billingStatus must be one of ${allowed.join(", ")}`);
    const existing = await this.requireInstallation(installationId);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { billingStatus: status, enabled: status === "ACTIVE" ? undefined : false },
    });
    await this.log(actor, "BILLING_STATUS", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      billingStatus: status,
    });
    return updated;
  }

  async install(installationId: string, versionId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.approvedAt)
      throw new ConflictException(
        "Extension request must be approved before installation",
      );
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException(
        "Published extension version not found for this extension",
      );
    if (existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        version,
      );
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: {
        installedVersionId: versionId,
        installedAt: new Date(),
        installedBy: actor.userId,
        uninstalledAt: null,
        purgeAfter: null,
      },
    });
    await this.log(actor, "INSTALL", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      versionId,
    });
    return updated;
  }

  async upgrade(
    installationId: string,
    versionId: string,
    actor: Actor,
    acknowledgePermissions = false,
  ) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.installedAt)
      throw new ConflictException(
        "Extension must be installed before it can be upgraded",
      );
    if (existing.installedVersionId === versionId) return existing;
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException(
        "Published upgrade version not found for this extension",
      );
    if (existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        version,
        installationId,
      );
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    const permissionReview = this.permissionReview(
      existing.installedVersion,
      version,
    );
    if (permissionReview.added.length && !acknowledgePermissions) {
      throw new ConflictException(
        `Upgrade requests new permissions: ${permissionReview.added.join(", ")}`,
      );
    }
    let configuration =
      (existing.configuration as Record<string, any> | null) || {};
    if (existing.enabled && existing.extension.runtimeType === "THEME") {
      const current = await this.prisma.siteSetting.findUnique({
        where: { schoolId: existing.schoolId },
      });
      const schoolOverrides = this.themeOverrides(
        current,
        configuration.appliedTheme,
      );
      const appliedTheme = await this.applyThemeVersion(
        existing.schoolId,
        version,
        schoolOverrides,
      );
      configuration = {
        ...configuration,
        rollbackVersionId: existing.installedVersionId,
        activeThemeVersionId: version.id,
        schoolOverrides,
        appliedTheme,
      };
    }
    const migration =
      existing.extension.runtimeType === "DECLARATIVE_MODULE"
        ? this.findMigration(existing.installedVersion.version, version)
        : null;
    const updated = migration
      ? await this.applyMigration(
          existing,
          version,
          migration,
          actor,
          configuration,
        )
      : await this.prisma.extensionInstallation.update({
          where: { id: installationId },
          data: {
            installedVersionId: version.id,
            installedBy: actor.userId,
            installedAt: new Date(),
            configuration,
            availableVersionId: null,
            updateNotifiedAt: null,
          },
        });
    await this.log(actor, "UPGRADE", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromVersionId: existing.installedVersionId,
      toVersionId: version.id,
      permissionReview,
    });
    return updated;
  }

  async setUpdatePolicy(installationId: string, policy: string, actor: Actor) {
    if (!["MANUAL", "NOTIFY", "AUTO_APPROVED"].includes(policy)) {
      throw new BadRequestException(
        "Update policy must be MANUAL, NOTIFY, or AUTO_APPROVED",
      );
    }
    const existing = await this.requireInstallation(installationId);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { updatePolicy: policy },
    });
    await this.log(
      actor,
      "UPDATE_POLICY",
      updated.id,
      existing.extension.name,
      {
        schoolId: existing.schoolId,
        extensionId: existing.extensionId,
        before: existing.updatePolicy,
        after: policy,
      },
    );
    return updated;
  }

  async removeUninstalled(installationId: string, actor: Actor) {
    const installation = await this.requireInstallation(installationId);
    if (!installation.uninstalledAt || installation.enabled)
      throw new ConflictException(
        "Only an uninstalled extension can be removed from school history",
      );
    if (installation.invoiceStorageKey)
      await this.storage.deletePrivate(installation.invoiceStorageKey).catch(() => undefined);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.extensionRecord.deleteMany({
        where: {
          schoolId: installation.schoolId,
          extensionId: installation.extensionId,
        },
      });
      await transaction.extensionInstallation.delete({
        where: { id: installationId },
      });
    });
    await this.log(actor, "REMOVE_HISTORY", installationId, installation.extension.name, {
      schoolId: installation.schoolId,
      extensionId: installation.extensionId,
    });
    return { removed: true, installationId };
  }

  async upgradeReview(installationId: string, versionId: string) {
    const existing = await this.requireInstallation(installationId);
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
    });
    if (!version)
      throw new NotFoundException(
        "Published upgrade version not found for this extension",
      );
    return {
      installationId,
      fromVersion: existing.installedVersion.version,
      toVersion: version.version,
      permissions: this.permissionReview(existing.installedVersion, version),
      compatibilityRange: version.compatibilityRange,
    };
  }

  async dependencyReview(installationId: string, versionId: string) {
    const existing = await this.requireInstallation(installationId);
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
    });
    if (!version)
      throw new NotFoundException(
        "Published extension version not found for this extension",
      );
    return this.resolveDependencies(
      existing.schoolId,
      existing.extension.key,
      version,
      installationId,
    );
  }

  async rollback(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const configuration =
      (existing.configuration as Record<string, any> | null) || {};
    const rollbackVersionId = configuration.rollbackVersionId;
    if (!rollbackVersionId)
      throw new ConflictException("No rollback version is available");
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: rollbackVersionId,
        extensionId: existing.extensionId,
        lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException("Rollback version is unavailable or blocked");
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    let updatedConfiguration: Record<string, any> = {
      ...configuration,
      rollbackVersionId: existing.installedVersionId,
      activeThemeVersionId: version.id,
    };
    if (existing.enabled && existing.extension.runtimeType === "THEME") {
      const appliedTheme = await this.applyThemeVersion(
        existing.schoolId,
        version,
        configuration.schoolOverrides || {},
      );
      updatedConfiguration = { ...updatedConfiguration, appliedTheme };
    }
    const updated =
      existing.extension.runtimeType === "DECLARATIVE_MODULE" &&
      configuration.migrationRunId
        ? await this.rollbackMigration(
            existing,
            version,
            configuration.migrationRunId,
            updatedConfiguration,
          )
        : await this.prisma.extensionInstallation.update({
            where: { id: installationId },
            data: {
              installedVersionId: version.id,
              configuration: updatedConfiguration,
            },
          });
    await this.log(actor, "ROLLBACK", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromVersionId: existing.installedVersionId,
      toVersionId: version.id,
    });
    return updated;
  }

  async activate(installationId: string, enabled: boolean, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (enabled && (!existing.approvedAt || !existing.installedAt)) {
      throw new ConflictException(
        "Extension must be approved and installed before activation",
      );
    }
    if (enabled && existing.installedVersion.lifecycleStatus !== "PUBLISHED") {
      throw new ConflictException(
        "Only a published extension version can be activated",
      );
    }
    if (
      enabled &&
      existing.extension.price != null &&
      existing.extension.price > 0 &&
      existing.billingStatus !== "ACTIVE"
    ) {
      throw new ConflictException(
        "Paid extension billing must be active before activation",
      );
    }
    if (enabled && existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        existing.installedVersion,
        installationId,
      );
    if (enabled && existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(existing.installedVersion);
    let configuration = existing.configuration as Record<string, any> | null;
    if (existing.extension.runtimeType === "THEME") {
      if (enabled) {
        const manifest = existing.installedVersion.manifest as Record<
          string,
          any
        >;
        const styleAsset = existing.installedVersion.assets.find(
          (asset) => asset.path.toLowerCase().split("/").pop() === "style.css",
        );
        const css = styleAsset
          ? (await this.storage.getPrivate(styleAsset.storageKey)).toString(
              "utf8",
            )
          : "";
        const current = await this.prisma.siteSetting.findUnique({
          where: { schoolId: existing.schoolId },
        });
        configuration = {
          ...(configuration || {}),
          previousTheme: current
            ? {
                mode: current.mode,
                primaryColor: current.primaryColor,
                secondaryColor: current.secondaryColor,
                font: current.font,
                radius: current.radius,
                customCss: current.customCss,
              }
            : null,
          activeThemeVersionId: existing.installedVersionId,
          appliedTheme: {
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
          schoolOverrides: {},
        };
        await this.prisma.siteSetting.upsert({
          where: { schoolId: existing.schoolId },
          update: {
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
          create: {
            schoolId: existing.schoolId,
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
        });
      } else if (configuration?.previousTheme) {
        await this.prisma.siteSetting.update({
          where: { schoolId: existing.schoolId },
          data: configuration.previousTheme,
        });
      }
    }
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { enabled, configuration },
    });
    await this.log(
      actor,
      enabled ? "ACTIVATE" : "DEACTIVATE",
      updated.id,
      existing.extension.name,
      { schoolId: existing.schoolId, extensionId: existing.extensionId },
    );
    return updated;
  }

  async uninstall(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const installations =
      (await this.prisma.extensionInstallation.findMany({
        where: {
          schoolId: existing.schoolId,
          enabled: true,
          id: { not: installationId },
        },
        include: { extension: true, installedVersion: true },
      })) || [];
    const dependents = installations.filter((installation) =>
      (
        ((installation.installedVersion.manifest as Record<string, any>)
          ?.dependencies || []) as Array<{ key: string; optional: boolean }>
      ).some(
        (dependency) =>
          dependency.key === existing.extension.key && !dependency.optional,
      ),
    );
    if (dependents.length)
      throw new ConflictException(
        `Cannot uninstall while required by: ${dependents.map((installation) => installation.extension.name).join(", ")}`,
      );
    const configuration = existing.configuration as Record<string, any> | null;
    if (
      existing.enabled &&
      existing.extension.runtimeType === "THEME" &&
      configuration?.previousTheme
    ) {
      await this.prisma.siteSetting.update({
        where: { schoolId: existing.schoolId },
        data: configuration.previousTheme,
      });
    }
    const uninstalledAt = new Date();
    const purgeAfter = new Date(
      uninstalledAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { enabled: false, uninstalledAt, purgeAfter },
    });
    await this.log(actor, "UNINSTALL", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      purgeAfter: purgeAfter.toISOString(),
    });
    return updated;
  }

  private async requireInstallation(id: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id },
      include: {
        extension: true,
        installedVersion: { include: { assets: true, signingKey: true } },
      },
    });
    if (!installation)
      throw new NotFoundException("Extension installation not found");
    return installation;
  }

  private async requireInstallationSummary(id: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id },
      include: {
        extension: true,
        installedVersion: true,
      },
    });
    if (!installation)
      throw new NotFoundException("Extension installation not found");
    return installation;
  }

  private permissionReview(
    currentVersion: { manifest: unknown },
    targetVersion: { manifest: unknown },
  ) {
    const current = ((currentVersion.manifest as Record<string, any>)
      ?.permissions || []) as string[];
    const target = ((targetVersion.manifest as Record<string, any>)
      ?.permissions || []) as string[];
    return {
      requested: target,
      added: target.filter((permission) => !current.includes(permission)),
      removed: current.filter((permission) => !target.includes(permission)),
    };
  }

  private async assertDependencies(
    schoolId: string,
    extensionKey: string,
    version: { version: string; manifest: unknown },
    excludedInstallationId?: string,
  ) {
    const review = await this.resolveDependencies(
      schoolId,
      extensionKey,
      version,
      excludedInstallationId,
    );
    const missing = review.dependencies.filter(
      (dependency) => !dependency.optional && dependency.status !== "SATISFIED",
    );
    if (missing.length)
      throw new ConflictException(
        `Required extensions are unavailable: ${missing.map((dependency) => `${dependency.key} (${dependency.status})`).join(", ")}`,
      );
    if (review.conflicts.length)
      throw new ConflictException(
        `Conflicting extensions are active: ${review.conflicts.join(", ")}`,
      );
  }

  private async resolveDependencies(
    schoolId: string,
    extensionKey: string,
    version: { version: string; manifest: unknown },
    excludedInstallationId?: string,
  ) {
    const manifest = (version.manifest as Record<string, any>) || {};
    const dependencies = (manifest.dependencies || []) as Array<{
      key: string;
      versionRange?: string;
      optional: boolean;
    }>;
    const declaredConflicts = new Set<string>(
      (manifest.conflicts || []) as string[],
    );
    const installations =
      (await this.prisma.extensionInstallation.findMany({
        where: {
          schoolId,
          enabled: true,
          ...(excludedInstallationId
            ? { id: { not: excludedInstallationId } }
            : {}),
        },
        include: { extension: true, installedVersion: true },
      })) || [];
    const active = new Map(
      installations.map((installation) => [
        installation.extension.key,
        installation,
      ]),
    );
    const resolved = dependencies.map((dependency) => {
      const installation = active.get(dependency.key);
      const status = !installation
        ? "MISSING"
        : dependency.versionRange &&
            !this.versionMatches(
              installation.installedVersion.version,
              dependency.versionRange,
            )
          ? "INCOMPATIBLE"
          : "SATISFIED";
      return {
        ...dependency,
        status,
        installedVersion: installation?.installedVersion.version || null,
      };
    });
    const conflicts = installations
      .filter((installation) => {
        const reverse = (
          ((installation.installedVersion.manifest as Record<string, any>)
            ?.conflicts || []) as string[]
        ).includes(extensionKey);
        return declaredConflicts.has(installation.extension.key) || reverse;
      })
      .map((installation) => installation.extension.key);
    return {
      extensionKey,
      version: version.version,
      dependencies: resolved,
      conflicts,
    };
  }

  private versionMatches(version: string, range: string) {
    const current = version.split("-")[0].split(".").map(Number);
    return range.split(/\s+/).every((comparator) => {
      const operator = comparator.match(/^(>=|>|<=|<)/)?.[1];
      const target = comparator
        .replace(/^(>=|>|<=|<)/, "")
        .split(".")
        .map(Number);
      const comparison =
        current[0] - target[0] ||
        current[1] - target[1] ||
        current[2] - target[2];
      return operator === ">="
        ? comparison >= 0
        : operator === ">"
          ? comparison > 0
          : operator === "<="
            ? comparison <= 0
            : comparison < 0;
    });
  }

  private findMigration(
    fromVersion: string,
    targetVersion: { version: string; manifest: unknown },
  ) {
    const migrations = ((targetVersion.manifest as Record<string, any>)
      ?.migrations || []) as Array<{
      fromVersion: string;
      toVersion: string;
      operations: any[];
    }>;
    return (
      migrations.find(
        (migration) =>
          migration.fromVersion === fromVersion &&
          migration.toVersion === targetVersion.version,
      ) || null
    );
  }

  private async applyMigration(
    existing: any,
    version: any,
    migration: { operations: any[] },
    actor: Actor,
    configuration: Record<string, any>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const resources = [
          ...new Set(
            migration.operations.map((operation) => operation.resource),
          ),
        ] as string[];
        const records = await transaction.extensionRecord.findMany({
          where: {
            schoolId: existing.schoolId,
            extensionId: existing.extensionId,
            resource: { in: resources },
          },
        });
        const run = await transaction.extensionMigrationRun.create({
          data: {
            installationId: existing.id,
            schoolId: existing.schoolId,
            extensionId: existing.extensionId,
            fromVersionId: existing.installedVersionId,
            toVersionId: version.id,
            operations: migration.operations as Prisma.InputJsonValue,
          },
        });
        let byteDelta = 0;
        for (const record of records) {
          const original = record.data as Record<string, unknown>;
          const migrated = { ...original };
          for (const operation of migration.operations.filter(
            (candidate) => candidate.resource === record.resource,
          )) {
            if (
              operation.type === "renameField" &&
              Object.prototype.hasOwnProperty.call(migrated, operation.from)
            ) {
              if (Object.prototype.hasOwnProperty.call(migrated, operation.to))
                throw new ConflictException(
                  `Migration target field already exists: ${operation.to}`,
                );
              migrated[operation.to] = migrated[operation.from];
              delete migrated[operation.from];
            } else if (
              operation.type === "setDefault" &&
              !Object.prototype.hasOwnProperty.call(migrated, operation.field)
            ) {
              migrated[operation.field] = operation.value;
            } else if (operation.type === "removeField") {
              delete migrated[operation.field];
            }
          }
          const byteSize = Buffer.byteLength(JSON.stringify(migrated), "utf8");
          byteDelta += byteSize - record.byteSize;
          await transaction.extensionMigrationBackup.create({
            data: {
              migrationRunId: run.id,
              recordId: record.id,
              resource: record.resource,
              data: original as Prisma.InputJsonValue,
              byteSize: record.byteSize,
            },
          });
          await transaction.extensionRecord.update({
            where: { id: record.id },
            data: {
              data: migrated as Prisma.InputJsonValue,
              byteSize,
              updatedBy: actor.userId,
            },
          });
        }
        return transaction.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            installedVersionId: version.id,
            installedBy: actor.userId,
            installedAt: new Date(),
            configuration: {
              ...configuration,
              rollbackVersionId: existing.installedVersionId,
              migrationRunId: run.id,
            },
            dataBytes: { increment: byteDelta },
            availableVersionId: null,
            updateNotifiedAt: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async rollbackMigration(
    existing: any,
    version: any,
    migrationRunId: string,
    configuration: Record<string, any>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const run = await transaction.extensionMigrationRun.findUnique({
          where: { id: migrationRunId },
          include: { backups: true },
        });
        if (
          !run ||
          run.status !== "APPLIED" ||
          run.installationId !== existing.id ||
          run.toVersionId !== existing.installedVersionId ||
          run.fromVersionId !== version.id
        ) {
          throw new ConflictException(
            "Declarative migration rollback state is invalid",
          );
        }
        let byteDelta = 0;
        for (const backup of run.backups) {
          const record = await transaction.extensionRecord.findUnique({
            where: { id: backup.recordId },
          });
          if (!record)
            throw new ConflictException(
              `Cannot roll back deleted migrated record ${backup.recordId}`,
            );
          byteDelta += backup.byteSize - record.byteSize;
          await transaction.extensionRecord.update({
            where: { id: backup.recordId },
            data: { data: backup.data, byteSize: backup.byteSize },
          });
        }
        const { migrationRunId: ignored, ...rest } = configuration;
        const updated = await transaction.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            installedVersionId: version.id,
            configuration: rest,
            dataBytes: { increment: byteDelta },
          },
        });
        await transaction.extensionMigrationRun.update({
          where: { id: run.id },
          data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyThemeVersion(
    schoolId: string,
    version: {
      manifest: any;
      assets: Array<{ path: string; storageKey: string }>;
    },
    overrides: Record<string, unknown> = {},
  ) {
    const manifest = version.manifest as Record<string, any>;
    const styleAsset = version.assets.find(
      (asset) => asset.path.toLowerCase().split("/").pop() === "style.css",
    );
    const customCss = styleAsset
      ? (await this.storage.getPrivate(styleAsset.storageKey)).toString("utf8")
      : "";
    const appliedTheme = {
      mode: manifest.mode,
      primaryColor: manifest.tokens.primaryColor,
      secondaryColor: manifest.tokens.secondaryColor,
      font: manifest.tokens.font,
      radius: manifest.tokens.radius,
      customCss,
    };
    const merged = { ...appliedTheme, ...overrides };
    await this.prisma.siteSetting.upsert({
      where: { schoolId },
      update: merged,
      create: { schoolId, ...merged },
    });
    return appliedTheme;
  }

  private themeOverrides(
    current: Record<string, any> | null,
    appliedTheme: Record<string, any> | null | undefined,
  ) {
    if (!current || !appliedTheme) return {};
    const overrides: Record<string, unknown> = {};
    for (const key of [
      "mode",
      "primaryColor",
      "secondaryColor",
      "font",
      "radius",
      "customCss",
    ]) {
      if (current[key] !== appliedTheme[key]) overrides[key] = current[key];
    }
    return overrides;
  }

  private log(
    actor: Actor,
    action: string,
    resourceId: string,
    resourceLabel: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      action,
      resource: "EXTENSION_INSTALLATION",
      resourceId,
      resourceLabel,
      metadata,
    });
  }
}
