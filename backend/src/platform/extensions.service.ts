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
  ) {}

  list() {
    return this.prisma.extension.findMany({
      where: { status: { not: "RETIRED" } },
      include: {
        publisherEntity: true,
        versions: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async setVisibility(extensionId: string, visibility: string, actor: Actor) {
    if (!VISIBILITIES.includes(visibility))
      throw new BadRequestException(
        "visibility must be LISTED, UNLISTED, or PRIVATE",
      );
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "PUBLISH");
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
      },
    );
    return updated;
  }

  async setPricing(
    extensionId: string,
    data: { price?: number | null; priceNote?: string | null },
    actor: Actor,
  ) {
    if (data.price != null && (!Number.isFinite(data.price) || data.price < 0))
      throw new BadRequestException("price must be a non-negative number");
    const existing = await this.prisma.extension.findUnique({
      where: { id: extensionId },
    });
    if (!existing) throw new NotFoundException("Extension not found");
    await this.requirePublisherRole(existing.publisherId, actor, "PUBLISH");
    const updated = await this.prisma.extension.update({
      where: { id: extensionId },
      data: {
        price: data.price == null ? null : data.price,
        priceNote: data.price == null ? null : data.priceNote?.trim() || null,
      },
    });
    await this.log(actor, "PRICING_CHANGE", "EXTENSION", extensionId, existing.name, {
      changes: {
        before: { price: existing.price, priceNote: existing.priceNote },
        after: { price: updated.price, priceNote: updated.priceNote },
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
      category?: string;
    },
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
        description: data.description?.trim() || undefined,
        runtimeType: data.runtimeType,
        commercialType: data.commercialType,
        category: data.category?.trim() || undefined,
        publisher: "WATTAMAN",
        publisherId: publisher.id,
      },
    });
    await this.log(actor, "CREATE", "EXTENSION", extension.id, extension.name, {
      after: extension,
    });
    return extension;
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
    if (existing.packageChecksum === checksum && existing.packageStorageKey)
      return existing;
    if (existing.lifecycleStatus !== "UPLOADED") {
      throw new ConflictException(
        "A package can only be uploaded while the version is in UPLOADED state",
      );
    }
    const storageKey = `quarantine/extensions/${existing.extensionId}/${existing.id}/${checksum}.zip`;
    await this.storage.putPrivate(storageKey, file.buffer, "application/zip");
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        packageStorageKey: storageKey,
        packageChecksum: checksum,
        packageSize: file.size,
        lifecycleStatus: "QUARANTINED",
      },
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
    const validation = await this.prisma.extensionValidation.create({
      data: {
        extensionVersionId: versionId,
        status: "RUNNING",
        validatorVersion: "1",
      },
    });
    await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: { lifecycleStatus: "VALIDATING" },
    });
    const validationResult = await this.packageValidator.validate(
      file,
      existing.extension,
      existing.version,
    );
    if (validationResult.valid) {
      for (const asset of validationResult.files) {
        const assetStorageKey = `validated/extensions/${existing.extensionId}/${existing.id}/${asset.checksum}/${asset.path}`;
        await this.storage.putPrivate(
          assetStorageKey,
          asset.contents,
          asset.mimeType,
        );
        await this.prisma.extensionAsset.upsert({
          where: {
            extensionVersionId_path: {
              extensionVersionId: versionId,
              path: asset.path,
            },
          },
          update: {},
          create: {
            extensionVersionId: versionId,
            path: asset.path,
            storageKey: assetStorageKey,
            checksum: asset.checksum,
            mimeType: asset.mimeType,
            size: asset.size,
          },
        });
      }
    }
    await this.prisma.extensionValidation.update({
      where: { id: validation.id },
      data: {
        status: validationResult.valid ? "PASSED" : "FAILED",
        errors: validationResult.errors as any,
        warnings: validationResult.warnings as any,
        completedAt: new Date(),
      },
    });
    const finalVersion = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        lifecycleStatus: validationResult.valid ? "VALIDATED" : "REJECTED",
        manifest: validationResult.manifest
          ? (validationResult.manifest as any)
          : existing.manifest,
      },
    });
    await this.log(
      actor,
      validationResult.valid ? "VALIDATE" : "VALIDATION_FAILED",
      "EXTENSION_PACKAGE",
      finalVersion.id,
      finalVersion.version,
      {
        metadata: {
          validationId: validation.id,
          errorCount: validationResult.errors.length,
          warningCount: validationResult.warnings.length,
        },
      },
    );
    return finalVersion;
  }

  async validationReports(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    return this.prisma.extensionValidation.findMany({
      where: { extensionVersionId: versionId },
      orderBy: { startedAt: "desc" },
    });
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
      await this.storage.putPrivate(
        publishedStorageKey,
        packageContents,
        "application/zip",
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
        data: { enabled: false },
      });
    }
    if (["AWAITING_REVIEW", "APPROVED", "REJECTED"].includes(nextStatus)) {
      await this.prisma.extensionReview.create({
        data: {
          extensionVersionId: versionId,
          action: nextStatus === "AWAITING_REVIEW" ? "SUBMITTED" : nextStatus,
          notes: reviewNotes?.trim() || undefined,
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
      },
    );
    return updated;
  }

  async reviewSummary(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: {
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

  async compatibilityMatrix(extensionId: string) {
    const extension = await this.prisma.extension.findUnique({
      where: { id: extensionId },
      include: { versions: { orderBy: { createdAt: "desc" } } },
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

  async reviewHistory(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("Extension version not found");
    return this.prisma.extensionReview.findMany({
      where: { extensionVersionId: versionId },
      orderBy: { createdAt: "asc" },
    });
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
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: { lifecycleStatus: "AWAITING_REVIEW", reviewNotes: notes.trim() },
    });
    await this.prisma.extensionReview.create({
      data: {
        extensionVersionId: versionId,
        action: "APPEALED",
        notes: notes.trim(),
        actorId: actor.userId,
        actorRole: actor.role,
      },
    });
    await this.log(
      actor,
      "APPEAL",
      "EXTENSION_VERSION",
      versionId,
      existing.version,
      { metadata: { notes: notes.trim() } },
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

  async deleteExtension(extensionId: string, actor: Actor) {
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
        metadata: { reason: "Core modules are retired instead of physically deleted" },
      });
      return { deleted: true, retired: true, extensionId };
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
      try {
        await this.storage.deletePrivate(storageKey);
        deletedStorageObjects += 1;
      } catch {
        // Database cleanup must not be blocked by an already-missing R2 object.
      }
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
      if (existing.legacyAddonKey) {
        await transaction.schoolAddon.deleteMany({
          where: { addonKey: existing.legacyAddonKey },
        });
        await transaction.addonDefinition.deleteMany({
          where: { key: existing.legacyAddonKey },
        });
      }
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

  publishers() {
    return this.prisma.extensionPublisher.findMany({
      include: {
        _count: { select: { extensions: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        signingKeys: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "asc" },
    });
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

  signingKeys(publisherId: string) {
    return this.prisma.extensionSigningKey.findMany({
      where: { publisherId },
      orderBy: { createdAt: "desc" },
    });
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
        data: { enabled: false },
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
        data: { enabled: false },
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
