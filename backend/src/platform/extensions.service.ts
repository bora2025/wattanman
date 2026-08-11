import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { R2StorageService } from "../storage/r2-storage.service";
import { createHash } from "crypto";
import { ExtensionValidationRunnerService } from "./extension-validation-runner.service";
import { ExtensionSigningService } from "./extension-signing.service";
import { QueueInfrastructureService } from "../jobs/queue-infrastructure.service";
import { AntivirusScannerService } from "../security/antivirus-scanner.service";
import { dateIdPage, dateIdPageBy, decodeDateIdCursor, parsePageLimit } from "../common/cursor-pagination";
import {
  ExtensionCatalogMetadataInput,
  normalizeCatalogMetadata,
} from "./extension-catalog-metadata";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMPATIBILITY_PATTERN =
  /^(?:(?:>=|>)\d+\.\d+\.\d+)(?:\s+(?:<=|<)\d+\.\d+\.\d+)?$/;
const VISIBILITIES = ["LISTED", "UNLISTED", "PRIVATE"];
const RUNTIME_TYPES = [
  "CORE_MODULE",
  "DECLARATIVE_MODULE",
  "THEME",
  "INTEGRATION",
  "CODE_EXTENSION",
];
const COMMERCIAL_TYPES = ["MODULE", "ADDON", "THEME"];
const PRICING_MODELS = ["FREE", "ONE_TIME", "SUBSCRIPTION", "PRIVATE_CONTRACT"];
const BILLING_INTERVALS = ["MONTHLY", "YEARLY"];
const VALIDATION_PIPELINE_VERSION = "extension-validation-pipeline/2.0.0";
const MUTABLE_VERSION_STATUSES = new Set([
  "UPLOADED",
  "QUARANTINED",
  "VALIDATING",
  "VALIDATED",
  "REJECTED",
  "AWAITING_REVIEW",
]);
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  UPLOADED: ["QUARANTINED", "REJECTED"],
  QUARANTINED: ["VALIDATING", "REJECTED"],
  VALIDATING: ["VALIDATED", "REJECTED"],
  VALIDATED: ["AWAITING_REVIEW", "REJECTED"],
  AWAITING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED", "REJECTED"],
  PUBLISHED: ["DEPRECATED", "BLOCKED"],
  DEPRECATED: ["BLOCKED", "RETIRED"],
  BLOCKED: ["DEPRECATED", "RETIRED"],
  REJECTED: [],
  RETIRED: [],
};

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

@Injectable()
export class ExtensionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: R2StorageService,
    private packageValidator: ExtensionValidationRunnerService,
    private signing: ExtensionSigningService,
    private queues: QueueInfrastructureService,
    private antivirus: AntivirusScannerService,
  ) {}

  private uploadValidationId(versionId: string, checksum: string) {
    return createHash("sha256")
      .update(`extension-upload:${versionId}:${checksum}`)
      .digest("hex");
  }

  private async enqueueUploadCompletion(
    versionId: string,
    checksum: string,
    validationId: string,
    actor: Actor,
  ) {
    await this.queues.enqueue("extensions", {
      type: "extension.package.complete",
      tenant: { mode: "PLATFORM", schoolId: "PLATFORM" },
      actor: { id: actor.userId, role: actor.role || "PLATFORM_ADMIN", name: actor.name },
      idempotencyKey: `extension-package:${versionId}:${checksum}`,
      payload: { versionId, checksum, validationId },
    });
  }

  async list(input: { cursor?: string; limit?: string; search?: string; lifecycleStatus?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const search = input.search?.trim().slice(0, 100);
    const rows = await this.prisma.extension.findMany({
      where: {
        status: { not: "RETIRED" },
        AND: [
          ...(search ? [{ OR: [{ name: { contains: search, mode: "insensitive" as const } }, { key: { contains: search, mode: "insensitive" as const } }] }] : []),
          ...(input.lifecycleStatus && input.lifecycleStatus !== "ALL" ? [{ versions: { some: { lifecycleStatus: input.lifecycleStatus } } }] : []),
          ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
        ],
      },
      include: {
        publisherEntity: true,
        versions: { orderBy: { createdAt: "desc" }, take: 100 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async setVisibility(extensionId: string, visibility: string, actor: Actor, reason?: string) {
    if (!VISIBILITIES.includes(visibility))
      throw new BadRequestException(
        "visibility must be LISTED, UNLISTED, or PRIVATE",
      );
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "PUBLISH");
    if (existing.visibility === 'LISTED' && visibility !== 'LISTED' && !reason?.trim()) {
      throw new BadRequestException('A reason is required to delist an extension');
    }
    const updated = await this.prisma.extension.update({
      where: { id: extensionId },
      data: { visibility, isListed: visibility === "LISTED" },
    });
    await this.log(
      actor,
      "VISIBILITY_CHANGE",
      "EXTENSION",
      extensionId,
      existing.name,
      {
        changes: {
          before: { visibility: existing.visibility },
          after: { visibility },
        },
        metadata: { reason: reason?.trim() || null },
      },
    );
    return updated;
  }

  async setPricing(
    extensionId: string,
    data: {
      pricingModel?: string;
      priceMinor?: number | null;
      price?: number | null;
      currency?: string;
      billingInterval?: string | null;
      contractReference?: string | null;
      priceNote?: string | null;
    },
    actor: Actor,
  ) {
    const legacyMinor = data.price == null ? null : Math.round(data.price * 100);
    const priceMinor = data.priceMinor === undefined ? legacyMinor : data.priceMinor;
    const pricingModel = (data.pricingModel || (priceMinor && priceMinor > 0 ? "ONE_TIME" : "FREE")).trim().toUpperCase();
    const currency = (data.currency || "USD").trim().toUpperCase();
    const billingInterval = data.billingInterval?.trim().toUpperCase() || null;
    const contractReference = data.contractReference?.trim() || null;
    if (!PRICING_MODELS.includes(pricingModel)) {
      throw new BadRequestException(`pricingModel must be one of ${PRICING_MODELS.join(", ")}`);
    }
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException("currency must be a three-letter ISO code");
    if (priceMinor != null && (!Number.isSafeInteger(priceMinor) || priceMinor <= 0)) {
      throw new BadRequestException("priceMinor must be a positive integer");
    }
    if (pricingModel === "FREE" && (priceMinor != null || billingInterval)) {
      throw new BadRequestException("Free extensions cannot have a price or billing interval");
    }
    if (pricingModel === "ONE_TIME" && (priceMinor == null || billingInterval)) {
      throw new BadRequestException("One-time pricing requires a price and no billing interval");
    }
    if (pricingModel === "SUBSCRIPTION" && (priceMinor == null || !BILLING_INTERVALS.includes(billingInterval || ""))) {
      throw new BadRequestException("Subscription pricing requires a price and MONTHLY or YEARLY interval");
    }
    if (pricingModel === "PRIVATE_CONTRACT" && (priceMinor != null || billingInterval || !contractReference)) {
      throw new BadRequestException("Private-contract pricing requires a contract reference and no public price");
    }
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "PUBLISH");
    const updated = await this.prisma.extension.update({
      where: { id: extensionId },
      data: {
        pricingModel,
        priceMinor: pricingModel === "FREE" || pricingModel === "PRIVATE_CONTRACT" ? null : priceMinor,
        price: priceMinor == null ? null : priceMinor / 100,
        currency,
        billingInterval: pricingModel === "SUBSCRIPTION" ? billingInterval : null,
        contractReference: pricingModel === "PRIVATE_CONTRACT" ? contractReference : null,
        priceNote: data.priceNote?.trim() || null,
      },
    });
    await this.log(actor, "PRICING_CHANGE", "EXTENSION", extensionId, existing.name, {
      changes: {
        before: {
          pricingModel: existing.pricingModel,
          priceMinor: existing.priceMinor,
          currency: existing.currency,
          billingInterval: existing.billingInterval,
          contractReference: existing.contractReference,
          priceNote: existing.priceNote,
        },
        after: {
          pricingModel: updated.pricingModel,
          priceMinor: updated.priceMinor,
          currency: updated.currency,
          billingInterval: updated.billingInterval,
          contractReference: updated.contractReference,
          priceNote: updated.priceNote,
        },
      },
    });
    return updated;
  }

  async grantPrivateAccess(
    extensionId: string,
    schoolId: string,
    granted: boolean,
    actor: Actor,
  ) {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!extension) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(extension.publisherId, actor, "PUBLISH");
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) throw new NotFoundException("School not found");
    if (granted) {
      await this.prisma.extensionVisibilityGrant.upsert({
        where: { extensionId_schoolId: { extensionId, schoolId } },
        update: { grantedBy: actor.userId },
        create: { extensionId, schoolId, grantedBy: actor.userId },
      });
    } else {
      await this.prisma.extensionVisibilityGrant.deleteMany({
        where: { extensionId, schoolId },
      });
    }
    await this.log(
      actor,
      granted ? "GRANT_PRIVATE_ACCESS" : "REVOKE_PRIVATE_ACCESS",
      "EXTENSION",
      extensionId,
      extension.name,
      { metadata: { schoolId, schoolName: school.name } },
    );
    return { extensionId, schoolId, granted };
  }

  async createExtension(
    data: {
      key: string;
      name: string;
      description?: string;
      runtimeType: string;
      commercialType: string;
    } & ExtensionCatalogMetadataInput,
    actor: Actor,
  ) {
    const key = data.key?.trim().toUpperCase();
    const name = data.name?.trim();
    if (!key || !KEY_PATTERN.test(key))
      throw new BadRequestException(
        "key must use 2-64 uppercase letters, numbers, or underscores",
      );
    if (!name) throw new BadRequestException("name is required");
    if (!RUNTIME_TYPES.includes(data.runtimeType))
      throw new BadRequestException(
        `runtimeType must be one of ${RUNTIME_TYPES.join(", ")}`,
      );
    if (!COMMERCIAL_TYPES.includes(data.commercialType))
      throw new BadRequestException(
        `commercialType must be one of ${COMMERCIAL_TYPES.join(", ")}`,
      );
    if (data.runtimeType === "CODE_EXTENSION") {
      throw new BadRequestException(
        "Executable code extensions are not enabled for the initial internal release",
      );
    }
    const metadata = normalizeCatalogMetadata(data);

    const existing = await this.prisma.extension.findUnique({ where: { key } });
    if (existing)
      throw new ConflictException(`Extension key ${key} already exists`);

    const publisher = await this.prisma.extensionPublisher.upsert({
      where: { key: "WATTAMAN" },
      update: {},
      create: {
        key: "WATTAMAN",
        name: "Wattaman",
        status: "ACTIVE",
        internal: true,
      },
    });
    if (publisher.status !== "ACTIVE")
      throw new ConflictException("The Wattaman publisher is not active");
    await this.requirePublisherRole(publisher.id, actor, "UPLOAD");
    const extension = await this.prisma.extension.create({
      data: {
        key,
        name,
        runtimeType: data.runtimeType,
        commercialType: data.commercialType,
        ...metadata,
        publisher: "WATTAMAN",
        publisherId: publisher.id,
      },
    });
    await this.log(actor, "CREATE", "EXTENSION", extension.id, extension.name, {
      after: extension,
    });
    return extension;
  }

  async updateCatalogMetadata(
    extensionId: string,
    data: ExtensionCatalogMetadataInput,
    actor: Actor,
  ) {
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "MANAGE");
    const metadata = normalizeCatalogMetadata(data);
    const updated = await this.prisma.extension.update({
      where: { id: extensionId },
      data: metadata,
    });
    await this.log(
      actor,
      "CATALOG_METADATA_UPDATE",
      "EXTENSION",
      extensionId,
      existing.name,
      {
        changes: {
          before: {
            description: existing.description,
            category: existing.category,
            tags: existing.tags,
            locales: existing.locales,
            supportUrl: existing.supportUrl,
            privacyPolicyUrl: existing.privacyPolicyUrl,
            dataUse: existing.dataUse,
          },
          after: metadata,
        },
      },
    );
    return updated;
  }

  async createVersion(
    extensionId: string,
    data: {
      version: string;
      manifest: Record<string, unknown>;
      manifestSchema?: number;
      compatibilityRange?: string;
      releaseNotes?: string;
    },
    actor: Actor,
  ) {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: { publisherEntity: true },
    });
    if (!extension) throw new NotFoundException("Extension not found");
    if (extension.publisherEntity.status !== "ACTIVE")
      throw new ConflictException("Publisher is not active");
    await this.requirePublisherRole(extension.publisherId, actor, "UPLOAD");
    const version = data.version?.trim();
    if (!version || !VERSION_PATTERN.test(version))
      throw new BadRequestException(
        "version must use semantic versioning, e.g. 1.0.0",
      );
    if (
      !data.manifest ||
      typeof data.manifest !== "object" ||
      Array.isArray(data.manifest)
    ) {
      throw new BadRequestException("manifest must be a JSON object");
    }
    if (
      data.compatibilityRange?.trim() &&
      !COMPATIBILITY_PATTERN.test(data.compatibilityRange.trim())
    ) {
      throw new BadRequestException(
        "compatibilityRange must use comparators such as >=1.0.0 <2.0.0",
      );
    }
    const duplicate = await this.prisma.extensionVersion.findUnique({
      where: { extensionId_version: { extensionId, version } },
    });
    if (duplicate)
      throw new ConflictException(`Version ${version} already exists`);

    const created = await this.prisma.extensionVersion.create({
      data: {
        extensionId,
        version,
        manifest: data.manifest as any,
        manifestSchema: data.manifestSchema ?? 1,
        compatibilityRange: data.compatibilityRange?.trim() || undefined,
        releaseNotes: data.releaseNotes?.trim() || undefined,
        uploadedBy: actor.userId,
      },
    });
    await this.log(
      actor,
      "CREATE",
      "EXTENSION_VERSION",
      created.id,
      `${extension.key}@${version}`,
      { after: created },
    );
    return created;
  }

  async updateDraft(
    versionId: string,
    data: {
      manifest?: Record<string, unknown>;
      compatibilityRange?: string | null;
      releaseNotes?: string | null;
    },
    actor: Actor,
  ) {
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    if (!MUTABLE_VERSION_STATUSES.has(existing.lifecycleStatus)) {
      throw new ConflictException(
        "Approved and published extension versions are immutable; create a new version instead",
      );
    }
    if (
      data.compatibilityRange?.trim() &&
      !COMPATIBILITY_PATTERN.test(data.compatibilityRange.trim())
    ) {
      throw new BadRequestException(
        "compatibilityRange must use comparators such as >=1.0.0 <2.0.0",
      );
    }
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        manifest: data.manifest as any,
        compatibilityRange:
          data.compatibilityRange === null
            ? null
            : data.compatibilityRange?.trim() || undefined,
        releaseNotes:
          data.releaseNotes === null
            ? null
            : data.releaseNotes?.trim() || undefined,
      },
    });
    await this.log(
      actor,
      "UPDATE",
      "EXTENSION_VERSION",
      updated.id,
      updated.version,
      { before: existing, after: updated },
    );
    return updated;
  }

  async uploadPackage(
    versionId: string,
    file: Express.Multer.File,
    actor: Actor,
  ) {
    if (!file.originalname.toLowerCase().endsWith(".zip"))
      throw new BadRequestException("Extension package must be a .zip file");
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: { include: { publisherEntity: true } } },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    if (existing.extension.publisherEntity.status !== "ACTIVE")
      throw new ConflictException("Publisher is not active");
    await this.requirePublisherRole(
      existing.extension.publisherId,
      actor,
      "UPLOAD",
    );
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const validationId = this.uploadValidationId(versionId, checksum);
    if (existing.packageChecksum === checksum && existing.packageStorageKey) {
      if (["QUARANTINED", "VALIDATING"].includes(existing.lifecycleStatus)) {
        await this.prisma.extensionValidation.upsert({
          where: { id: validationId },
          update: {},
          create: {
            id: validationId,
            extensionVersionId: versionId,
            status: "PENDING",
            validatorVersion: VALIDATION_PIPELINE_VERSION,
            reportSchema: 1,
          },
        });
        await this.enqueueUploadCompletion(versionId, checksum, validationId, actor);
      }
      return existing;
    }
    if (existing.lifecycleStatus !== "UPLOADED") {
      throw new ConflictException(
        "A package can only be uploaded while the version is in UPLOADED state",
      );
    }
    const storageKey = `quarantine/extensions/${existing.extensionId}/${existing.id}/${checksum}.zip`;
    await this.storage.putPrivateImmutable(storageKey, file.buffer, "application/zip", checksum);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const version = await transaction.extensionVersion.update({
        where: { id: versionId },
        data: {
          packageStorageKey: storageKey,
          packageChecksum: checksum,
          packageSize: file.size,
          lifecycleStatus: "QUARANTINED",
        },
      });
      await transaction.extensionValidation.upsert({
        where: { id: validationId },
        update: {},
        create: {
          id: validationId,
          extensionVersionId: versionId,
          status: "PENDING",
          validatorVersion: VALIDATION_PIPELINE_VERSION,
          reportSchema: 1,
        },
      });
      return version;
    });
    await this.log(
      actor,
      "UPLOAD",
      "EXTENSION_PACKAGE",
      updated.id,
      updated.version,
      {
        metadata: { storageKey, checksum, size: file.size },
      },
    );
    await this.enqueueUploadCompletion(versionId, checksum, validationId, actor);
    return updated;
  }

  async completePackageUpload(
    payload: { versionId: string; checksum: string; validationId: string },
    actor: Actor,
  ) {
    if (!payload?.versionId || !/^[a-f0-9]{64}$/.test(payload.checksum) || !/^[a-f0-9]{64}$/.test(payload.validationId))
      throw new BadRequestException("Invalid extension package completion payload");
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: payload.versionId },
      include: { extension: true },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    if (existing.packageChecksum !== payload.checksum || !existing.packageStorageKey)
      throw new ConflictException("Extension package identity does not match the queued completion");
    const validation = await this.prisma.extensionValidation.findUnique({ where: { id: payload.validationId } });
    if (!validation || validation.extensionVersionId !== existing.id)
      throw new ConflictException("Extension package validation identity does not match");
    if (["PASSED", "FAILED"].includes(validation.status)) return existing;
    await this.prisma.extensionValidation.updateMany({
      where: { id: payload.validationId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "RUNNING", completedAt: null },
    });
    await this.prisma.extensionVersion.updateMany({
      where: { id: existing.id, lifecycleStatus: { in: ["QUARANTINED", "VALIDATING"] } },
      data: { lifecycleStatus: "VALIDATING" },
    });
    const packageBuffer = await this.storage.getPrivate(existing.packageStorageKey);
    const downloadedChecksum = createHash("sha256").update(packageBuffer).digest("hex");
    if (downloadedChecksum !== payload.checksum)
      throw new ConflictException("Quarantined extension package checksum mismatch");
    const antivirusVersion = await this.antivirus.version();
    const antivirusResult = await this.antivirus.scan(packageBuffer);
    const validationResult = antivirusResult.clean
      ? await this.packageValidator.validate(
          {
            originalname: `${existing.extension.key}-${existing.version}.zip`,
            buffer: packageBuffer,
            size: packageBuffer.length,
            mimetype: "application/zip",
          } as Express.Multer.File,
          existing.extension,
          existing.version,
        )
      : {
          valid: false,
          errors: [{ code: "MALWARE_DETECTED", message: `ClamAV detected ${antivirusResult.signature || "malware"}` }],
          warnings: [],
          files: [],
          manifest: undefined,
        };
    if (validationResult.valid) {
      for (const asset of validationResult.files) {
        const assetStorageKey = `validated/extensions/${existing.extensionId}/${existing.id}/${asset.checksum}/${asset.path}`;
        await this.storage.putPrivateImmutable(
          assetStorageKey,
          asset.contents,
          asset.mimeType,
          asset.checksum,
        );
        await this.prisma.extensionAsset.upsert({
          where: {
            extensionVersionId_path: {
              extensionVersionId: existing.id,
              path: asset.path,
            },
          },
          update: {},
          create: {
            extensionVersionId: existing.id,
            path: asset.path,
            storageKey: assetStorageKey,
            checksum: asset.checksum,
            mimeType: asset.mimeType,
            size: asset.size,
          },
        });
      }
    }
    const finalVersion = await this.prisma.$transaction(async (transaction) => {
      await transaction.extensionValidation.update({
        where: { id: payload.validationId },
        data: {
          status: validationResult.valid ? "PASSED" : "FAILED",
          errors: validationResult.errors as any,
          warnings: validationResult.warnings as any,
          completedAt: new Date(),
          validatorVersion: VALIDATION_PIPELINE_VERSION,
          reportSchema: 1,
          toolVersions: {
            pipeline: VALIDATION_PIPELINE_VERSION,
            clamav: antivirusVersion.engineVersion,
            clamavSignatures: antivirusVersion.signatureVersion,
            ...(validationResult.toolVersions || {}),
          } as any,
        },
      });
      return transaction.extensionVersion.update({
        where: { id: existing.id },
        data: {
          lifecycleStatus: validationResult.valid ? "VALIDATED" : "REJECTED",
          manifest: validationResult.manifest
            ? (validationResult.manifest as any)
            : existing.manifest,
        },
      });
    });
    await this.log(
      actor,
      validationResult.valid ? "VALIDATE" : "VALIDATION_FAILED",
      "EXTENSION_PACKAGE",
      finalVersion.id,
      finalVersion.version,
      {
        metadata: {
          validationId: payload.validationId,
          errorCount: validationResult.errors.length,
          warningCount: validationResult.warnings.length,
          antivirusEngine: antivirusResult.engine,
          antivirusSignature: antivirusResult.signature,
        },
      },
    );
    return finalVersion;
  }

  async validationReports(versionId: string, cursorValue?: string, limitValue?: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionValidation.findMany({
      where: {
        extensionVersionId: versionId,
        ...(cursor ? { OR: [{ startedAt: { lt: cursor.createdAt } }, { startedAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPageBy(rows, limit, (row) => row.startedAt);
  }

  async themePreview(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: {
        extension: true,
        assets: true,
        validations: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { warnings: true },
        },
      },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    if (version.extension.runtimeType !== "THEME")
      throw new BadRequestException(
        "Preview is only available for theme extensions",
      );
    if (
      ![
        "VALIDATED",
        "AWAITING_REVIEW",
        "APPROVED",
        "PUBLISHED",
        "DEPRECATED",
      ].includes(version.lifecycleStatus)
    ) {
      throw new ConflictException("Theme must pass validation before preview");
    }
    const styleAsset = version.assets.find(
      (asset) => asset.path.toLowerCase().split("/").pop() === "style.css",
    );
    const css = styleAsset
      ? (await this.storage.getPrivate(styleAsset.storageKey)).toString("utf8")
      : "";
    return {
      versionId: version.id,
      version: version.version,
      manifest: version.manifest,
      css,
      compatibilityRange: version.compatibilityRange,
      platformVersion: this.platformVersion(),
      platformCompatible: this.isCompatible(version.compatibilityRange),
      warnings:
        (version.validations?.[0]?.warnings as Array<{
          code: string;
          message: string;
        }> | null) || [],
    };
  }

  async transition(
    versionId: string,
    nextStatus: string,
    reviewNotes: string | undefined,
    actor: Actor,
    assessment?: Record<string, { status?: string; notes?: string }>,
  ) {
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: { include: { publisherEntity: true } } },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    if (existing.lifecycleStatus === nextStatus) return existing;
    const requiredRole = ["APPROVED", "REJECTED"].includes(nextStatus)
      ? "REVIEW"
      : nextStatus === "AWAITING_REVIEW"
        ? "UPLOAD"
        : "PUBLISH";
    await this.requirePublisherRole(
      existing.extension.publisherId,
      actor,
      requiredRole,
    );
    const allowed = ALLOWED_TRANSITIONS[existing.lifecycleStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new ConflictException(
        `Cannot transition extension version from ${existing.lifecycleStatus} to ${nextStatus}`,
      );
    }
    if (
      (nextStatus === "APPROVED" || nextStatus === "REJECTED") &&
      !reviewNotes?.trim()
    ) {
      throw new BadRequestException(
        "reviewNotes are required when approving or rejecting a version",
      );
    }
    const structuredAssessment = ["APPROVED", "REJECTED"].includes(nextStatus)
      ? this.validateReviewAssessment(assessment, nextStatus)
      : undefined;
    if (["DEPRECATED", "BLOCKED", "RETIRED"].includes(nextStatus) && !reviewNotes?.trim()) {
      throw new BadRequestException(`A reason is required to mark a release ${nextStatus.toLowerCase()}`);
    }
    if (
      (nextStatus === "APPROVED" || nextStatus === "REJECTED") &&
      this.reviewSeparationRequired()
    ) {
      if (!existing.uploadedBy || !actor.userId) {
        throw new ConflictException(
          "Uploader/reviewer separation cannot be verified for this release",
        );
      }
      if (existing.uploadedBy === actor.userId) {
        throw new ConflictException(
          "The package uploader cannot approve or reject the same release",
        );
      }
    }
    if (
      nextStatus === "AWAITING_REVIEW" &&
      (!existing.releaseNotes?.trim() || !existing.compatibilityRange?.trim())
    ) {
      throw new ConflictException(
        "Release notes and a platform compatibility range are required before review",
      );
    }
    if (
      nextStatus === "PUBLISHED" &&
      existing.extension.publisherEntity.status !== "ACTIVE"
    ) {
      throw new ConflictException("Publisher is not active");
    }
    let publishedStorageKey: string | undefined;
    let signature:
      | { signingKeyId: string; packageSignature: string; signedAt: Date }
      | undefined;
    if (nextStatus === "PUBLISHED") {
      const checklist = await this.publicationChecklist(versionId);
      if (!checklist.ready) {
        throw new ConflictException(
          `Publication checklist is incomplete: ${checklist.items.filter((item) => !item.passed).map((item) => `${item.label} (${item.detail})`).join(', ')}`,
        );
      }
      if (!existing.packageStorageKey || !existing.packageChecksum) {
        throw new ConflictException(
          "A validated package artifact is required before publication",
        );
      }
      if (existing.extension.runtimeType === "DECLARATIVE_MODULE")
        await this.assertDependencyGraph(existing);
      signature = await this.signing.signForPublication(
        existing,
        existing.extension.publisherId,
      );
      publishedStorageKey = `published/extensions/${existing.extensionId}/${existing.id}/${existing.packageChecksum}.zip`;
      const packageContents = await this.storage.getPrivate(
        existing.packageStorageKey,
      );
      await this.storage.putPrivateImmutable(
        publishedStorageKey,
        packageContents,
        "application/zip",
        existing.packageChecksum,
      );
    }
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        lifecycleStatus: nextStatus,
        reviewNotes: reviewNotes?.trim() || undefined,
        reviewedBy:
          nextStatus === "APPROVED" || nextStatus === "REJECTED"
            ? actor.userId
            : undefined,
        publishedAt: nextStatus === "PUBLISHED" ? new Date() : undefined,
        packageStorageKey: publishedStorageKey,
        ...signature,
      },
    });
    if (nextStatus === "PUBLISHED") {
      await this.prisma.extension.update({
        where: { id: existing.extensionId },
        data: { isListed: true, visibility: "LISTED", status: "ACTIVE" },
      });
      await this.storage
        .deletePrivate(existing.packageStorageKey!)
        .catch(() => undefined);
    }
    if (nextStatus === "BLOCKED") {
      await this.prisma.extensionInstallation.updateMany({
        where: { installedVersionId: versionId, enabled: true },
        data: { enabled: false, lifecycleState: "INSTALLED" },
      });
    }
    if (nextStatus === "RETIRED") {
      const remaining = await this.prisma.extensionVersion.count({
        where: { extensionId: existing.extensionId, id: { not: versionId }, lifecycleStatus: { notIn: ["RETIRED", "REJECTED"] } },
      });
      if (remaining === 0) {
        await this.prisma.extension.update({
          where: { id: existing.extensionId },
          data: { status: "RETIRED", visibility: "UNLISTED", isListed: false },
        });
      }
    }
    if (["AWAITING_REVIEW", "APPROVED", "REJECTED"].includes(nextStatus)) {
      await this.prisma.extensionReview.create({
        data: {
          extensionVersionId: versionId,
          action: nextStatus === "AWAITING_REVIEW" ? "SUBMITTED" : nextStatus,
          notes: reviewNotes?.trim() || undefined,
          assessment: structuredAssessment as any,
          actorId: actor.userId,
          actorRole: actor.role,
        },
      });
    }
    await this.log(
      actor,
      "STATUS_CHANGE",
      "EXTENSION_VERSION",
      updated.id,
      updated.version,
      {
        changes: {
          before: { lifecycleStatus: existing.lifecycleStatus },
          after: { lifecycleStatus: nextStatus },
        },
        metadata: { reason: reviewNotes?.trim() || null },
      },
    );
    return updated;
  }

  private reviewSeparationRequired() {
    const configured = process.env.EXTENSION_REVIEW_SEPARATION_REQUIRED?.trim().toLowerCase();
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return process.env.NODE_ENV === 'production';
  }

  private validateReviewAssessment(
    assessment: Record<string, { status?: string; notes?: string }> | undefined,
    decision: string,
  ) {
    const domains = ['technical', 'permissions', 'privacy', 'compatibility'];
    const normalized: Record<string, { status: string; notes: string }> = {};
    for (const domain of domains) {
      const status = assessment?.[domain]?.status?.trim().toUpperCase();
      const notes = assessment?.[domain]?.notes?.trim();
      if (!['PASS', 'WARN', 'FAIL'].includes(status || '') || !notes) {
        throw new BadRequestException(`Structured ${domain} review requires PASS, WARN, or FAIL plus notes`);
      }
      normalized[domain] = { status: status!, notes };
    }
    const statuses = Object.values(normalized).map((item) => item.status);
    if (decision === 'APPROVED' && statuses.includes('FAIL')) {
      throw new BadRequestException('An approved review cannot contain a failed domain');
    }
    if (decision === 'REJECTED' && !statuses.includes('FAIL')) {
      throw new BadRequestException('A rejected review must identify at least one failed domain');
    }
    return normalized;
  }

  async reviewSummary(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: {
        validations: { orderBy: { startedAt: 'desc' }, take: 1 },
        extension: {
          include: {
            versions: {
              where: { lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] } },
              orderBy: { publishedAt: "desc" },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    const permissions =
      (version.manifest as Record<string, any>)?.permissions || [];
    const previous = version.extension.versions.find(
      (candidate) => candidate.id !== version.id,
    );
    const previousPermissions = previous
      ? (previous.manifest as Record<string, any>)?.permissions || []
      : [];
    return {
      versionId: version.id,
      compatibilityRange: version.compatibilityRange,
      platformVersion: this.platformVersion(),
      platformCompatible: this.isCompatible(version.compatibilityRange),
      previousVersion: previous?.version || null,
      technical: {
        validationStatus: version.validations?.[0]?.status || null,
        errors: version.validations?.[0]?.errors || [],
        warnings: version.validations?.[0]?.warnings || [],
      },
      privacy: {
        policyUrl: version.extension.privacyPolicyUrl,
        dataUse: version.extension.dataUse,
      },
      permissions: {
        requested: permissions,
        added: permissions.filter(
          (permission: string) => !previousPermissions.includes(permission),
        ),
        removed: previousPermissions.filter(
          (permission: string) => !permissions.includes(permission),
        ),
      },
      warnings: this.isCompatible(version.compatibilityRange)
        ? []
        : ["This version is not compatible with the current platform version"],
    };
  }

  async publicationChecklist(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: { include: { publisherEntity: true } } },
    });
    if (!version) throw new NotFoundException('Extension version not found');
    const [validation, review] = await Promise.all([
      this.prisma.extensionValidation.findFirst({
        where: { extensionVersionId: versionId, status: 'PASSED' },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.extensionReview.findFirst({
        where: { extensionVersionId: versionId, action: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const configuredKeyId = process.env.EXTENSION_SIGNING_KEY_ID?.trim();
    const signingKey = configuredKeyId
      ? await this.prisma.extensionSigningKey.findFirst({
          where: { publisherId: version.extension.publisherId, keyId: configuredKeyId, status: 'ACTIVE' },
        })
      : null;
    const assessment = (review?.assessment || {}) as Record<string, { status?: string; notes?: string }>;
    const reviewDomains = ['technical', 'permissions', 'privacy', 'compatibility'];
    const structuredReviewPassed = reviewDomains.every((domain) =>
      ['PASS', 'WARN'].includes(assessment[domain]?.status || '') && Boolean(assessment[domain]?.notes?.trim()),
    );
    const expectedStorageKey = version.packageChecksum
      ? `quarantine/extensions/${version.extensionId}/${version.id}/${version.packageChecksum}.zip`
      : null;
    let dependenciesPassed = true;
    let dependencyDetail = 'Not required';
    if (version.extension.runtimeType === 'DECLARATIVE_MODULE') {
      try {
        await this.assertDependencyGraph(version);
        dependencyDetail = 'Dependency graph is valid';
      } catch (error: any) {
        dependenciesPassed = false;
        dependencyDetail = error?.message || 'Dependency graph is invalid';
      }
    }
    const items = [
      { key: 'approved_state', label: 'Release is approved', passed: version.lifecycleStatus === 'APPROVED', detail: version.lifecycleStatus },
      { key: 'validation', label: 'Package validation passed', passed: Boolean(validation), detail: validation ? `Report v${validation.reportSchema || 1}` : 'No passing report' },
      { key: 'structured_review', label: 'Structured review passed', passed: Boolean(review) && structuredReviewPassed, detail: review ? 'Technical, permission, privacy, and compatibility review recorded' : 'No approval event' },
      { key: 'separation', label: 'Uploader/reviewer policy satisfied', passed: !this.reviewSeparationRequired() || Boolean(version.uploadedBy && version.reviewedBy && version.uploadedBy !== version.reviewedBy), detail: `${version.uploadedBy || 'unknown uploader'} / ${version.reviewedBy || 'unknown reviewer'}` },
      { key: 'artifact', label: 'Immutable package artifact is ready', passed: Boolean(expectedStorageKey && version.packageStorageKey === expectedStorageKey && version.packageSize && version.packageSize > 0), detail: version.packageChecksum || 'Checksum missing' },
      { key: 'release_notes', label: 'Release notes are present', passed: Boolean(version.releaseNotes?.trim()), detail: version.releaseNotes?.trim() ? 'Present' : 'Missing' },
      { key: 'compatibility', label: 'Platform compatibility is satisfied', passed: Boolean(version.compatibilityRange?.trim()) && this.isCompatible(version.compatibilityRange), detail: version.compatibilityRange || 'Missing range' },
      { key: 'publisher', label: 'Publisher is active', passed: version.extension.publisherEntity.status === 'ACTIVE', detail: version.extension.publisherEntity.status },
      { key: 'signing', label: 'Active signing configuration is available', passed: Boolean(signingKey && process.env.EXTENSION_SIGNING_PRIVATE_KEY_BASE64?.trim()), detail: signingKey?.keyId || configuredKeyId || 'Signing key not configured' },
      { key: 'dependencies', label: 'Dependency graph is valid', passed: dependenciesPassed, detail: dependencyDetail },
    ];
    return { versionId, ready: items.every((item) => item.passed), items };
  }

  async compatibilityMatrix(extensionId: string) {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 100 } },
    });
    if (!extension) throw new NotFoundException("Extension not found");
    return {
      extension: { id: extension.id, key: extension.key, name: extension.name },
      platformVersion: this.platformVersion(),
      versions: extension.versions.map((version) => ({
        id: version.id,
        version: version.version,
        lifecycleStatus: version.lifecycleStatus,
        compatibilityRange: version.compatibilityRange,
        compatible: this.isCompatible(version.compatibilityRange),
        releaseNotes: version.releaseNotes,
      })),
    };
  }

  async reviewHistory(versionId: string, cursorValue?: string, limitValue?: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionReview.findMany({
      where: {
        extensionVersionId: versionId,
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async appeal(versionId: string, notes: string | undefined, actor: Actor) {
    if (!notes?.trim())
      throw new BadRequestException("Appeal notes are required");
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: { include: { publisherEntity: true } } },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    if (existing.lifecycleStatus !== "REJECTED" || !existing.reviewedBy) {
      throw new ConflictException(
        "Only a reviewer-rejected version can be appealed",
      );
    }
    if (existing.extension.publisherEntity.status !== "ACTIVE")
      throw new ConflictException("Publisher is not active");
    await this.requirePublisherRole(
      existing.extension.publisherId,
      actor,
      "UPLOAD",
    );
    const appealNotes = notes.trim();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.extensionVersion.updateMany({
        where: {
          id: versionId,
          lifecycleStatus: "REJECTED",
          reviewedBy: existing.reviewedBy,
        },
        data: {
          lifecycleStatus: "AWAITING_REVIEW",
          reviewNotes: appealNotes,
          reviewedBy: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("This rejection has already been appealed or changed");
      }
      await transaction.extensionReview.create({
        data: {
          extensionVersionId: versionId,
          action: "APPEALED",
          notes: appealNotes,
          assessment: { appealedReviewerId: existing.reviewedBy } as any,
          actorId: actor.userId,
          actorRole: actor.role,
        },
      });
      return {
        ...existing,
        lifecycleStatus: "AWAITING_REVIEW",
        reviewNotes: appealNotes,
        reviewedBy: null,
      };
    });
    await this.log(
      actor,
      "APPEAL",
      "EXTENSION_VERSION",
      versionId,
      existing.version,
      { metadata: { notes: appealNotes, appealedReviewerId: existing.reviewedBy } },
    );
    return updated;
  }

  async deleteVersion(versionId: string, actor: Actor) {
    const existing = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: {
        extension: { include: { publisherEntity: true } },
        assets: { select: { storageKey: true } },
        installations: { select: { id: true }, take: 1 },
      },
    });
    if (!existing) throw new NotFoundException("Extension version not found");
    await this.requirePublisherRole(
      existing.extension.publisherId,
      actor,
      "MANAGE",
    );
    const deletableStatuses = ["UPLOADED", "VALIDATED", "REJECTED"];
    if (!deletableStatuses.includes(existing.lifecycleStatus)) {
      throw new ConflictException(
        "Only uploaded drafts, validated drafts, or rejected extension versions can be deleted",
      );
    }
    if (existing.installations.length) {
      throw new ConflictException(
        "An extension version with installation history cannot be deleted",
      );
    }

    const storageKeys = new Set<string>();
    if (existing.packageStorageKey) storageKeys.add(existing.packageStorageKey);
    for (const asset of existing.assets) storageKeys.add(asset.storageKey);
    for (const storageKey of storageKeys)
      await this.storage.deletePrivate(storageKey);

    await this.prisma.extensionAlert.updateMany({
      where: { versionId },
      data: { versionId: null },
    });
    await this.prisma.extensionVersion.delete({ where: { id: versionId } });
    await this.log(
      actor,
      "DELETE",
      "EXTENSION_VERSION",
      versionId,
      existing.version,
      {
        before: {
          extensionId: existing.extensionId,
          version: existing.version,
          lifecycleStatus: existing.lifecycleStatus,
        },
        metadata: { deletedStorageObjects: storageKeys.size },
      },
    );
    return { deleted: true, versionId, storageObjects: storageKeys.size };
  }

  async deleteExtension(extensionId: string, actor: Actor, reason?: string) {
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            lifecycleStatus: true,
            packageStorageKey: true,
            assets: { select: { storageKey: true } },
          },
        },
        installations: {
          select: {
            id: true,
            schoolId: true,
            enabled: true,
            installedAt: true,
            uninstalledAt: true,
            invoiceStorageKey: true,
          },
        },
        _count: { select: { records: true } },
      },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "MANAGE");
    if (!reason?.trim()) throw new BadRequestException("A purge or retirement reason is required");
    if (existing.runtimeType === "CORE_MODULE") {
      await this.prisma.$transaction([
        this.prisma.extensionInstallation.updateMany({
          where: { extensionId },
          data: { enabled: false },
        }),
        this.prisma.extension.update({
          where: { id: extensionId },
          data: {
            status: "RETIRED",
            isListed: false,
            visibility: "UNLISTED",
          },
        }),
      ]);
      await this.log(actor, "RETIRE", "EXTENSION", extensionId, existing.name, {
        before: { status: existing.status, visibility: existing.visibility },
        after: { status: "RETIRED", visibility: "UNLISTED" },
        metadata: { reason: reason.trim(), policy: "Core modules are retired instead of physically deleted" },
      });
      return { deleted: true, retired: true, extensionId };
    }
    if (existing.status !== "RETIRED" || existing.visibility !== "UNLISTED") {
      throw new ConflictException("Delist and retire every release before permanently purging an extension");
    }
    const nonTerminalVersions = existing.versions.filter(
      (version) => !["RETIRED", "REJECTED"].includes(version.lifecycleStatus),
    );
    if (nonTerminalVersions.length) {
      throw new ConflictException("Every release must be retired or rejected before extension purge");
    }
    const stillInstalled = existing.installations.filter(
      (installation) =>
        installation.enabled ||
        (installation.installedAt && !installation.uninstalledAt),
    );
    if (stillInstalled.length) {
      throw new ConflictException(
        "Uninstall this extension from every school before permanently deleting it",
      );
    }

    const storageKeys = new Set<string>();
    for (const version of existing.versions) {
      if (version.packageStorageKey) storageKeys.add(version.packageStorageKey);
      for (const asset of version.assets) storageKeys.add(asset.storageKey);
    }
    const invoiceStorageKeys = existing.installations
      .map((installation: any) => installation.invoiceStorageKey)
      .filter(Boolean) as string[];
    for (const storageKey of invoiceStorageKeys) storageKeys.add(storageKey);
    let deletedStorageObjects = 0;
    for (const storageKey of storageKeys) {
      await this.storage.deletePrivate(storageKey);
      deletedStorageObjects += 1;
    }

    const versionIds = existing.versions.map((version) => version.id);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.extensionAlert.updateMany({
        where: {
          OR: [
            { extensionId },
            ...(versionIds.length ? [{ versionId: { in: versionIds } }] : []),
          ],
        },
        data: { extensionId: null, versionId: null },
      });
      await transaction.extensionDependency.deleteMany({
        where: { OR: [{ extensionId }, { requiredExtensionId: extensionId }] },
      });
      await transaction.extensionInstallation.deleteMany({
        where: { extensionId },
      });
      await transaction.extension.delete({ where: { id: extensionId } });
    });
    await this.log(actor, "DELETE", "EXTENSION", extensionId, existing.name, {
      before: {
        key: existing.key,
        name: existing.name,
        runtimeType: existing.runtimeType,
        versions: existing.versions.map((version) => ({
          version: version.version,
          lifecycleStatus: version.lifecycleStatus,
        })),
      },
      metadata: {
        deletedVersions: existing.versions.length,
        deletedInstallations: existing.installations.length,
        deletedRecords: existing._count.records,
        deletedStorageObjects,
        reason: reason.trim(),
      },
    });
    return {
      deleted: true,
      extensionId,
      versions: existing.versions.length,
      installations: existing.installations.length,
      records: existing._count.records,
      storageObjects: deletedStorageObjects,
    };
  }

  async publishers(cursorValue?: string, limitValue?: string) {
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionPublisher.findMany({
      where: cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : undefined,
      include: {
        _count: { select: { extensions: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
          take: 100,
        },
        signingKeys: { orderBy: { createdAt: "desc" }, take: 100 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const configuredKeyId = process.env.EXTENSION_SIGNING_KEY_ID?.trim();
    return dateIdPage(rows.map((publisher) => ({
      ...publisher,
      signingKeys: (publisher.signingKeys || []).map(({ publicKeyPem, ...key }) => ({
        ...key,
        fingerprint: createHash("sha256").update(publicKeyPem).digest("hex"),
        isConfigured: key.keyId === configuredKeyId,
      })),
    })), limit);
  }

  async onboardPublisher(
    data: {
      key?: string;
      name?: string;
      legalName?: string;
      contactEmail?: string;
      websiteUrl?: string;
      countryCode?: string;
    },
    actor: Actor,
  ) {
    if (!actor.userId)
      throw new ForbiddenException("Publisher onboarding requires an authenticated platform user");
    const key = data.key?.trim().toUpperCase();
    const name = data.name?.trim();
    const legalName = data.legalName?.trim();
    const contactEmail = data.contactEmail?.trim().toLowerCase();
    const countryCode = data.countryCode?.trim().toUpperCase();
    if (!key || !KEY_PATTERN.test(key))
      throw new BadRequestException("Publisher key must use 2-64 uppercase letters, numbers, or underscores");
    if (!name || !legalName)
      throw new BadRequestException("Publisher name and legal name are required");
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
      throw new BadRequestException("A valid publisher contact email is required");
    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode))
      throw new BadRequestException("countryCode must be a two-letter ISO country code");
    let websiteUrl: string;
    try {
      const parsed = new URL(data.websiteUrl?.trim() || "");
      if (parsed.protocol !== "https:") throw new Error();
      websiteUrl = parsed.toString();
    } catch {
      throw new BadRequestException("Publisher websiteUrl must be a valid HTTPS URL");
    }
    const duplicate = await this.prisma.extensionPublisher.findUnique({ where: { key } });
    if (duplicate) throw new ConflictException(`Publisher key ${key} already exists`);

    const publisher = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.extensionPublisher.create({
        data: {
          key,
          name,
          legalName,
          contactEmail,
          websiteUrl,
          countryCode,
          internal: false,
          status: "SUSPENDED",
          verificationStatus: "PENDING",
        },
      });
      await transaction.extensionPublisherMember.create({
        data: {
          publisherId: created.id,
          userId: actor.userId!,
          roles: ["UPLOAD", "PUBLISH", "MANAGE"],
          status: "ACTIVE",
        },
      });
      return created;
    });
    await this.log(actor, "ONBOARD", "EXTENSION_PUBLISHER", publisher.id, publisher.name, {
      after: publisher,
    });
    return publisher;
  }

  async verifyPublisher(
    publisherId: string,
    data: { decision?: string; notes?: string },
    actor: Actor,
  ) {
    const decision = data.decision?.trim().toUpperCase();
    const notes = data.notes?.trim();
    if (!actor.userId)
      throw new ForbiddenException("Publisher verification requires an authenticated platform user");
    if (!['VERIFIED', 'REJECTED'].includes(decision || ''))
      throw new BadRequestException("decision must be VERIFIED or REJECTED");
    if (!notes || notes.length < 3)
      throw new BadRequestException("Verification notes are required");
    const existing = await this.prisma.extensionPublisher.findUnique({ where: { id: publisherId } });
    if (!existing) throw new NotFoundException("Extension publisher not found");
    const verifierMembership = await this.prisma.extensionPublisherMember.findUnique({
      where: { publisherId_userId: { publisherId, userId: actor.userId } },
    });
    if (verifierMembership?.status === "ACTIVE")
      throw new ForbiddenException("Publisher members cannot verify their own organization");
    if (existing.internal)
      throw new ConflictException("Internal publisher verification is managed by the platform");
    if (existing.status === "REVOKED")
      throw new ConflictException("A revoked publisher cannot be verified");
    const updated = await this.prisma.extensionPublisher.update({
      where: { id: publisherId },
      data: {
        verificationStatus: decision,
        verificationNotes: notes,
        verifiedAt: decision === "VERIFIED" ? new Date() : null,
        verifiedBy: actor.userId,
        status: decision === "VERIFIED" ? "ACTIVE" : "SUSPENDED",
      },
    });
    await this.log(actor, decision!, "EXTENSION_PUBLISHER_VERIFICATION", publisherId, existing.name, {
      changes: {
        before: { verificationStatus: existing.verificationStatus, status: existing.status },
        after: { verificationStatus: decision, status: updated.status },
      },
      metadata: { notes },
    });
    return updated;
  }

  async setPublisherMemberRoles(
    publisherId: string,
    userId: string,
    roles: string[],
    actor: Actor,
  ) {
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    const allowed = ["UPLOAD", "REVIEW", "PUBLISH", "MANAGE"];
    const normalized = [
      ...new Set((roles || []).map((role) => role.toUpperCase())),
    ];
    if (
      !normalized.length ||
      normalized.some((role) => !allowed.includes(role))
    ) {
      throw new BadRequestException(
        `Publisher roles must use one or more of ${allowed.join(", ")}`,
      );
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: "PLATFORM_ADMIN" },
    });
    if (!user) throw new NotFoundException("Platform admin not found");
    const current = await this.prisma.extensionPublisherMember.findUnique({
      where: { publisherId_userId: { publisherId, userId } },
    });
    if (
      current?.status === "ACTIVE" &&
      (current.roles as string[]).includes("MANAGE") &&
      !normalized.includes("MANAGE")
    ) {
      await this.assertAnotherActivePublisherManager(publisherId, userId);
    }
    const membership = await this.prisma.extensionPublisherMember.upsert({
      where: { publisherId_userId: { publisherId, userId } },
      update: { roles: normalized, status: "ACTIVE" },
      create: { publisherId, userId, roles: normalized, status: "ACTIVE" },
    });
    await this.log(
      actor,
      "UPDATE",
      "EXTENSION_PUBLISHER_MEMBER",
      membership.id,
      user.name,
      { metadata: { publisherId, roles: normalized } },
    );
    return membership;
  }

  async catalogCollections(cursorValue?: string, limitValue?: string) {
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionCatalogCollection.findMany({
      where: cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : undefined,
      include: {
        items: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          take: 100,
          include: { extension: { select: { id: true, key: true, name: true, status: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async createCatalogCollection(
    data: { slug?: string; title?: string; description?: string; locale?: string; sortOrder?: number; extensionIds?: string[] },
    actor: Actor,
  ) {
    const slug = data.slug?.trim().toLowerCase();
    const title = data.title?.trim();
    const locale = data.locale?.trim() || "en";
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new BadRequestException("Collection slug must use lowercase letters, numbers, and hyphens");
    if (!title) throw new BadRequestException("Collection title is required");
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale))
      throw new BadRequestException("Collection locale is invalid");
    const duplicate = await this.prisma.extensionCatalogCollection.findUnique({ where: { slug } });
    if (duplicate) throw new ConflictException(`Collection slug ${slug} already exists`);
    const extensionIds = await this.validCatalogExtensionIds(data.extensionIds || []);
    const created = await this.prisma.extensionCatalogCollection.create({
      data: {
        slug,
        title,
        description: data.description?.trim() || null,
        locale,
        sortOrder: Number.isInteger(data.sortOrder) ? data.sortOrder : 0,
        items: { create: extensionIds.map((extensionId, position) => ({ extensionId, position })) },
      },
      include: { items: true },
    });
    await this.log(actor, "CREATE", "EXTENSION_CATALOG_COLLECTION", created.id, title, { after: created });
    return created;
  }

  async updateCatalogCollection(
    collectionId: string,
    data: { title?: string; description?: string | null; locale?: string; sortOrder?: number; status?: string; extensionIds?: string[] },
    actor: Actor,
  ) {
    const existing = await this.prisma.extensionCatalogCollection.findUnique({
      where: { id: collectionId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException("Catalog collection not found");
    const status = data.status?.trim().toUpperCase();
    if (status && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))
      throw new BadRequestException("Collection status must be DRAFT, PUBLISHED, or ARCHIVED");
    if (status === "PUBLISHED" && data.extensionIds === undefined && !existing.items.length)
      throw new ConflictException("A published collection must contain at least one extension");
    const extensionIds = data.extensionIds === undefined ? undefined : await this.validCatalogExtensionIds(data.extensionIds);
    if (status === "PUBLISHED" && extensionIds && !extensionIds.length)
      throw new ConflictException("A published collection must contain at least one extension");
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (extensionIds) {
        await transaction.extensionCatalogCollectionItem.deleteMany({ where: { collectionId } });
        if (extensionIds.length) await transaction.extensionCatalogCollectionItem.createMany({
          data: extensionIds.map((extensionId, position) => ({ collectionId, extensionId, position })),
        });
      }
      return transaction.extensionCatalogCollection.update({
        where: { id: collectionId },
        data: {
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
          ...(data.locale !== undefined ? { locale: data.locale.trim() } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(status ? { status } : {}),
        },
        include: { items: { orderBy: { position: "asc" }, include: { extension: true } } },
      });
    });
    await this.log(actor, "UPDATE", "EXTENSION_CATALOG_COLLECTION", collectionId, updated.title, {
      changes: { before: existing, after: updated },
    });
    return updated;
  }

  private async validCatalogExtensionIds(values: string[]) {
    const extensionIds = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (extensionIds.length > 100) throw new BadRequestException("A collection supports at most 100 extensions");
    if (!extensionIds.length) return extensionIds;
    const extensions = await this.prisma.extension.findMany({
      where: { id: { in: extensionIds }, status: { not: "RETIRED" } },
      select: { id: true },
    });
    if (extensions.length !== extensionIds.length)
      throw new BadRequestException("Collection contains an unknown or retired extension");
    return extensionIds;
  }

  async addPublisherMemberByEmail(
    publisherId: string,
    emailValue: string | undefined,
    roles: string[],
    actor: Actor,
  ) {
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    const email = emailValue?.trim().toLowerCase();
    if (!email) throw new BadRequestException("Member email is required");
    const user = await this.prisma.user.findFirst({
      where: { email, role: "PLATFORM_ADMIN" },
    });
    if (!user) throw new NotFoundException("Platform admin with this email was not found");
    return this.setPublisherMemberRoles(publisherId, user.id, roles, actor);
  }

  async setPublisherMemberStatus(
    publisherId: string,
    userId: string,
    statusValue: string | undefined,
    actor: Actor,
  ) {
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    const status = statusValue?.trim().toUpperCase();
    if (!['ACTIVE', 'SUSPENDED'].includes(status || ''))
      throw new BadRequestException("Publisher member status must be ACTIVE or SUSPENDED");
    const membership = await this.prisma.extensionPublisherMember.findUnique({
      where: { publisherId_userId: { publisherId, userId } },
    });
    if (!membership) throw new NotFoundException("Publisher member not found");
    if (
      status === "SUSPENDED" &&
      membership.status === "ACTIVE" &&
      (membership.roles as string[]).includes("MANAGE")
    ) {
      await this.assertAnotherActivePublisherManager(publisherId, userId);
    }
    const updated = await this.prisma.extensionPublisherMember.update({
      where: { id: membership.id },
      data: { status },
    });
    await this.log(actor, "STATUS_CHANGE", "EXTENSION_PUBLISHER_MEMBER", membership.id, userId, {
      changes: { before: { status: membership.status }, after: { status } },
      metadata: { publisherId },
    });
    return updated;
  }

  private async assertAnotherActivePublisherManager(publisherId: string, excludedUserId: string) {
    const managers = await this.prisma.extensionPublisherMember.findMany({
      where: {
        publisherId,
        status: "ACTIVE",
        userId: { not: excludedUserId },
      },
      select: { roles: true },
    });
    if (!managers.some((member) => (member.roles as string[]).includes("MANAGE")))
      throw new ConflictException("A publisher must retain at least one active manager");
  }

  async signingKeys(publisherId: string, cursorValue?: string, limitValue?: string) {
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionSigningKey.findMany({
      where: {
        publisherId,
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async registerSigningKey(
    publisherId: string,
    data: { keyId?: string; publicKeyPem?: string },
    actor: Actor,
  ) {
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    const keyId = data.keyId?.trim();
    const publicKeyPem = data.publicKeyPem
      ? this.signing.normalizePublicKey(data.publicKeyPem)
      : undefined;
    if (!keyId || !/^[A-Za-z0-9._-]{3,100}$/.test(keyId))
      throw new BadRequestException("A valid signing key ID is required");
    if (!publicKeyPem)
      throw new BadRequestException("publicKeyPem is required");
    const duplicate = await this.prisma.extensionSigningKey.findUnique({
      where: { keyId },
    });
    if (duplicate) throw new ConflictException("Signing key ID already exists");
    const duplicatePublicKey = await this.prisma.extensionSigningKey.findFirst({
      where: { publisherId, publicKeyPem },
    });
    if (duplicatePublicKey)
      throw new ConflictException("This public signing key is already registered");
    const created = await this.prisma.extensionSigningKey.create({
      data: {
        publisherId,
        keyId,
        algorithm: "Ed25519",
        publicKeyPem,
        status: "ACTIVE",
      },
    });
    await this.log(
      actor,
      "CREATE",
      "EXTENSION_SIGNING_KEY",
      created.id,
      keyId,
      { metadata: { publisherId, algorithm: "Ed25519" } },
    );
    return created;
  }

  async rotateSigningKey(
    publisherId: string,
    currentKeyId: string,
    data: { newKeyId?: string; publicKeyPem?: string },
    actor: Actor,
  ) {
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    const current = await this.prisma.extensionSigningKey.findUnique({
      where: { id: currentKeyId },
    });
    if (!current || current.publisherId !== publisherId)
      throw new NotFoundException("Current signing key not found");
    if (current.status !== "ACTIVE")
      throw new ConflictException("Only an active signing key can begin rotation");
    const created = await this.registerSigningKey(
      publisherId,
      { keyId: data.newKeyId, publicKeyPem: data.publicKeyPem },
      actor,
    );
    await this.log(actor, "ROTATION_STARTED", "EXTENSION_SIGNING_KEY", created.id, created.keyId, {
      metadata: {
        publisherId,
        replacesSigningKeyId: current.id,
        replacesKeyId: current.keyId,
        nextStep: "Configure the new private key, publish a signed test release, then retire the previous key",
      },
    });
    return {
      currentKey: { id: current.id, keyId: current.keyId, status: current.status },
      newKey: created,
      nextStep: "Update EXTENSION_SIGNING_KEY_ID and EXTENSION_SIGNING_PRIVATE_KEY_BASE64, verify publication, then retire the old key",
    };
  }

  async setSigningKeyStatus(keyId: string, status: string, actor: Actor) {
    if (!["ACTIVE", "RETIRED", "REVOKED"].includes(status))
      throw new BadRequestException(
        "Signing key status must be ACTIVE, RETIRED, or REVOKED",
      );
    const existing = await this.prisma.extensionSigningKey.findUnique({
      where: { id: keyId },
    });
    if (!existing)
      throw new NotFoundException("Extension signing key not found");
    await this.requirePublisherRole(existing.publisherId, actor, "MANAGE");
    if (existing.status === "REVOKED" && status !== "REVOKED")
      throw new ConflictException(
        "A revoked signing key cannot be reactivated",
      );
    if (
      status === "RETIRED" &&
      existing.keyId === process.env.EXTENSION_SIGNING_KEY_ID?.trim()
    )
      throw new ConflictException(
        "Configured signing key cannot be retired; switch the signing environment to the replacement key first",
      );
    const now = new Date();
    const updated = await this.prisma.extensionSigningKey.update({
      where: { id: keyId },
      data: {
        status,
        retiredAt: status === "RETIRED" ? now : undefined,
        revokedAt: status === "REVOKED" ? now : undefined,
      },
    });
    if (status === "REVOKED") {
      await this.prisma.extensionVersion.updateMany({
        where: {
          signingKeyId: keyId,
          lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
        },
        data: { lifecycleStatus: "BLOCKED" },
      });
      await this.prisma.extensionInstallation.updateMany({
        where: { installedVersion: { signingKeyId: keyId }, enabled: true },
        data: { enabled: false, lifecycleState: "INSTALLED" },
      });
    }
    await this.log(
      actor,
      "STATUS_CHANGE",
      "EXTENSION_SIGNING_KEY",
      updated.id,
      updated.keyId,
      {
        changes: { before: { status: existing.status }, after: { status } },
      },
    );
    return updated;
  }

  async setPublisherStatus(publisherId: string, status: string, actor: Actor) {
    if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
      throw new BadRequestException(
        "Publisher status must be ACTIVE, SUSPENDED, or REVOKED",
      );
    }
    const existing = await this.prisma.extensionPublisher.findUnique({
      where: { id: publisherId },
    });
    if (!existing) throw new NotFoundException("Extension publisher not found");
    await this.requirePublisherRole(publisherId, actor, "MANAGE");
    if (status === "ACTIVE" && !existing.internal && existing.verificationStatus !== "VERIFIED")
      throw new ConflictException("Publisher must be verified before activation");
    const updated = await this.prisma.extensionPublisher.update({
      where: { id: publisherId },
      data: { status },
    });
    if (status !== "ACTIVE") {
      await this.prisma.extension.updateMany({
        where: { publisherId },
        data: { status: "SUSPENDED", isListed: false },
      });
      await this.prisma.extensionInstallation.updateMany({
        where: { extension: { publisherId }, enabled: true },
        data: { enabled: false, lifecycleState: "INSTALLED" },
      });
    } else {
      await this.prisma.extension.updateMany({
        where: { publisherId, status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      });
    }
    await this.log(
      actor,
      "STATUS_CHANGE",
      "EXTENSION_PUBLISHER",
      updated.id,
      updated.name,
      {
        changes: { before: { status: existing.status }, after: { status } },
      },
    );
    return updated;
  }

  async health() {
    const [extensions, lifecycleActions] = await Promise.all([
      this.prisma.extension.findMany({
        include: {
          publisherEntity: true,
          records: {
            select: {
              byteSize: true,
              school: { select: { id: true, name: true, subdomain: true } },
            },
          },
          versions: {
            orderBy: { createdAt: "desc" },
            include: {
              assets: { select: { size: true } },
              validations: { select: { status: true } },
              installations: {
                select: {
                  enabled: true,
                  school: { select: { id: true, name: true, subdomain: true } },
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.auditLog.groupBy({
        by: ["action"],
        where: {
          resource: {
            in: [
              "EXTENSION_VERSION",
              "EXTENSION_PACKAGE",
              "EXTENSION_INSTALLATION",
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const versions = extensions.flatMap((extension) =>
      extension.versions.map((version) => ({
        extension: {
          id: extension.id,
          key: extension.key,
          name: extension.name,
        },
        publisher: {
          key: extension.publisherEntity.key,
          status: extension.publisherEntity.status,
        },
        versionId: version.id,
        version: version.version,
        lifecycleStatus: version.lifecycleStatus,
        publishedAt: version.publishedAt,
        storageBytes:
          (version.packageSize || 0) +
          version.assets.reduce((sum, asset) => sum + asset.size, 0),
        validations: {
          total: version.validations.length,
          failed: version.validations.filter((validation) =>
            ["FAILED", "TIMED_OUT"].includes(validation.status),
          ).length,
        },
        adoption: {
          installations: version.installations.length,
          active: version.installations.filter(
            (installation) => installation.enabled,
          ).length,
          schools: version.installations.map(
            (installation) => installation.school,
          ),
        },
      })),
    );
    const schoolUsage = new Map<
      string,
      {
        school: { id: string; name: string; subdomain: string };
        recordBytes: number;
      }
    >();
    for (const extension of extensions) {
      for (const record of extension.records) {
        const usage = schoolUsage.get(record.school.id) || {
          school: record.school,
          recordBytes: 0,
        };
        usage.recordBytes += record.byteSize;
        schoolUsage.set(record.school.id, usage);
      }
    }
    const recordBytes = [...schoolUsage.values()].reduce(
      (sum, usage) => sum + usage.recordBytes,
      0,
    );
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        extensions: extensions.length,
        versions: versions.length,
        activeInstallations: versions.reduce(
          (sum, version) => sum + version.adoption.active,
          0,
        ),
        storageBytes: versions.reduce(
          (sum, version) => sum + version.storageBytes,
          0,
        ),
        recordBytes,
        failedValidations: versions.reduce(
          (sum, version) => sum + version.validations.failed,
          0,
        ),
      },
      lifecycleActions: Object.fromEntries(
        lifecycleActions.map((row) => [row.action, row._count._all]),
      ),
      schoolUsage: [...schoolUsage.values()].map((usage) => ({
        ...usage,
        quotaBytes: 100 * 1024 * 1024,
        percentUsed: Number(
          ((usage.recordBytes / (100 * 1024 * 1024)) * 100).toFixed(2),
        ),
      })),
      versions,
    };
  }

  private async requirePublisherRole(
    publisherId: string,
    actor: Actor,
    role: string,
  ) {
    if (!actor.userId)
      throw new ForbiddenException(
        "Publisher action requires an authenticated platform user",
      );
    const membership = await this.prisma.extensionPublisherMember.findUnique({
      where: { publisherId_userId: { publisherId, userId: actor.userId } },
    });
    const roles = (membership?.roles as string[] | undefined) || [];
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !roles.includes(role)
    ) {
      throw new ForbiddenException(
        `Publisher ${role.toLowerCase()} permission is required`,
      );
    }
  }

  private platformVersion() {
    return process.env.PLATFORM_VERSION || "1.0.0";
  }

  private async assertDependencyGraph(candidate: {
    id: string;
    extensionId: string;
    version: string;
    manifest: unknown;
    extension: { key: string };
  }) {
    const extensions = await this.prisma.extension.findMany({
      where: { runtimeType: "DECLARATIVE_MODULE", status: "ACTIVE" },
      select: {
        id: true,
        key: true,
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
          select: { version: true, manifest: true },
        },
      },
    });
    const graph = new Map<
      string,
      { version: string; manifest: Record<string, any> }
    >();
    for (const extension of extensions) {
      const version =
        extension.id === candidate.extensionId
          ? { version: candidate.version, manifest: candidate.manifest }
          : extension.versions[0];
      if (version)
        graph.set(extension.key, {
          version: version.version,
          manifest: version.manifest as Record<string, any>,
        });
    }
    graph.set(candidate.extension.key, {
      version: candidate.version,
      manifest: candidate.manifest as Record<string, any>,
    });
    for (const dependency of (candidate.manifest as Record<string, any>)
      ?.dependencies || []) {
      const target = graph.get(dependency.key);
      if (!target && !dependency.optional)
        throw new ConflictException(
          `Required extension ${dependency.key} has no published version`,
        );
      if (
        target &&
        dependency.versionRange &&
        !this.versionMatches(target.version, dependency.versionRange)
      ) {
        throw new ConflictException(
          `${dependency.key} ${target.version} does not satisfy ${dependency.versionRange}`,
        );
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string) => {
      if (visiting.has(key))
        throw new ConflictException(
          `Extension dependency cycle detected at ${key}`,
        );
      if (visited.has(key)) return;
      visiting.add(key);
      for (const dependency of graph.get(key)?.manifest?.dependencies || [])
        if (graph.has(dependency.key)) visit(dependency.key);
      visiting.delete(key);
      visited.add(key);
    };
    visit(candidate.extension.key);
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

  private isCompatible(range: string | null | undefined) {
    if (!range || !COMPATIBILITY_PATTERN.test(range)) return false;
    const current = this.platformVersion().split(".").map(Number);
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

  private log(
    actor: Actor,
    action: string,
    resource: string,
    resourceId: string,
    resourceLabel: string,
    detail: Record<string, unknown>,
  ) {
    return this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      action,
      resource,
      resourceId,
      resourceLabel,
      ...detail,
    });
  }
}
