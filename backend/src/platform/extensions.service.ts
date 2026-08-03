import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { createHash } from 'crypto';
import { ExtensionPackageValidatorService } from './extension-package-validator.service';

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RUNTIME_TYPES = ['CORE_MODULE', 'DECLARATIVE_MODULE', 'THEME', 'INTEGRATION', 'CODE_EXTENSION'];
const COMMERCIAL_TYPES = ['MODULE', 'ADDON', 'THEME'];
const MUTABLE_VERSION_STATUSES = new Set(['UPLOADED', 'QUARANTINED', 'VALIDATING', 'VALIDATED', 'REJECTED', 'AWAITING_REVIEW']);
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  UPLOADED: ['QUARANTINED', 'REJECTED'],
  QUARANTINED: ['VALIDATING', 'REJECTED'],
  VALIDATING: ['VALIDATED', 'REJECTED'],
  VALIDATED: ['AWAITING_REVIEW', 'REJECTED'],
  AWAITING_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED', 'REJECTED'],
  PUBLISHED: ['DEPRECATED', 'BLOCKED'],
  DEPRECATED: ['BLOCKED', 'RETIRED'],
  BLOCKED: ['DEPRECATED', 'RETIRED'],
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
    private packageValidator: ExtensionPackageValidatorService,
  ) {}

  list() {
    return this.prisma.extension.findMany({
      include: { versions: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExtension(data: {
    key: string;
    name: string;
    description?: string;
    runtimeType: string;
    commercialType: string;
    category?: string;
  }, actor: Actor) {
    const key = data.key?.trim().toUpperCase();
    const name = data.name?.trim();
    if (!key || !KEY_PATTERN.test(key)) throw new BadRequestException('key must use 2-64 uppercase letters, numbers, or underscores');
    if (!name) throw new BadRequestException('name is required');
    if (!RUNTIME_TYPES.includes(data.runtimeType)) throw new BadRequestException(`runtimeType must be one of ${RUNTIME_TYPES.join(', ')}`);
    if (!COMMERCIAL_TYPES.includes(data.commercialType)) throw new BadRequestException(`commercialType must be one of ${COMMERCIAL_TYPES.join(', ')}`);
    if (data.runtimeType === 'CODE_EXTENSION') {
      throw new BadRequestException('Executable code extensions are not enabled for the initial internal release');
    }

    const existing = await this.prisma.extension.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Extension key ${key} already exists`);

    const extension = await this.prisma.extension.create({
      data: {
        key,
        name,
        description: data.description?.trim() || undefined,
        runtimeType: data.runtimeType,
        commercialType: data.commercialType,
        category: data.category?.trim() || undefined,
        publisher: 'WATTAMAN',
      },
    });
    await this.log(actor, 'CREATE', 'EXTENSION', extension.id, extension.name, { after: extension });
    return extension;
  }

  async createVersion(extensionId: string, data: {
    version: string;
    manifest: Record<string, unknown>;
    manifestSchema?: number;
    compatibilityRange?: string;
    releaseNotes?: string;
  }, actor: Actor) {
    const extension = await this.prisma.extension.findUnique({ where: { id: extensionId } });
    if (!extension) throw new NotFoundException('Extension not found');
    const version = data.version?.trim();
    if (!version || !VERSION_PATTERN.test(version)) throw new BadRequestException('version must use semantic versioning, e.g. 1.0.0');
    if (!data.manifest || typeof data.manifest !== 'object' || Array.isArray(data.manifest)) {
      throw new BadRequestException('manifest must be a JSON object');
    }
    const duplicate = await this.prisma.extensionVersion.findUnique({
      where: { extensionId_version: { extensionId, version } },
    });
    if (duplicate) throw new ConflictException(`Version ${version} already exists`);

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
    await this.log(actor, 'CREATE', 'EXTENSION_VERSION', created.id, `${extension.key}@${version}`, { after: created });
    return created;
  }

  async updateDraft(versionId: string, data: {
    manifest?: Record<string, unknown>;
    compatibilityRange?: string | null;
    releaseNotes?: string | null;
  }, actor: Actor) {
    const existing = await this.prisma.extensionVersion.findUnique({ where: { id: versionId } });
    if (!existing) throw new NotFoundException('Extension version not found');
    if (!MUTABLE_VERSION_STATUSES.has(existing.lifecycleStatus)) {
      throw new ConflictException('Approved and published extension versions are immutable; create a new version instead');
    }
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        manifest: data.manifest as any,
        compatibilityRange: data.compatibilityRange === null ? null : data.compatibilityRange?.trim() || undefined,
        releaseNotes: data.releaseNotes === null ? null : data.releaseNotes?.trim() || undefined,
      },
    });
    await this.log(actor, 'UPDATE', 'EXTENSION_VERSION', updated.id, updated.version, { before: existing, after: updated });
    return updated;
  }

  async uploadPackage(versionId: string, file: Express.Multer.File, actor: Actor) {
    if (!file.originalname.toLowerCase().endsWith('.zip')) throw new BadRequestException('Extension package must be a .zip file');
    const existing = await this.prisma.extensionVersion.findUnique({ where: { id: versionId }, include: { extension: true } });
    if (!existing) throw new NotFoundException('Extension version not found');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    if (existing.packageChecksum === checksum && existing.packageStorageKey) return existing;
    if (existing.lifecycleStatus !== 'UPLOADED') {
      throw new ConflictException('A package can only be uploaded while the version is in UPLOADED state');
    }
    const storageKey = `quarantine/extensions/${existing.extensionId}/${existing.id}/${checksum}.zip`;
    await this.storage.putPrivate(storageKey, file.buffer, 'application/zip');
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        packageStorageKey: storageKey,
        packageChecksum: checksum,
        packageSize: file.size,
        lifecycleStatus: 'QUARANTINED',
      },
    });
    await this.log(actor, 'UPLOAD', 'EXTENSION_PACKAGE', updated.id, updated.version, {
      metadata: { storageKey, checksum, size: file.size },
    });
    const validation = await this.prisma.extensionValidation.create({
      data: { extensionVersionId: versionId, status: 'RUNNING', validatorVersion: '1' },
    });
    await this.prisma.extensionVersion.update({ where: { id: versionId }, data: { lifecycleStatus: 'VALIDATING' } });
    const validationResult = await this.packageValidator.validate(file, existing.extension, existing.version);
    if (validationResult.valid) {
      for (const asset of validationResult.files) {
        const assetStorageKey = `validated/extensions/${existing.extensionId}/${existing.id}/${asset.checksum}/${asset.path}`;
        await this.storage.putPrivate(assetStorageKey, asset.contents, asset.mimeType);
        await this.prisma.extensionAsset.upsert({
          where: { extensionVersionId_path: { extensionVersionId: versionId, path: asset.path } },
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
        status: validationResult.valid ? 'PASSED' : 'FAILED',
        errors: validationResult.errors as any,
        warnings: validationResult.warnings as any,
        completedAt: new Date(),
      },
    });
    const finalVersion = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        lifecycleStatus: validationResult.valid ? 'VALIDATED' : 'REJECTED',
        manifest: validationResult.manifest ? validationResult.manifest as any : existing.manifest,
      },
    });
    await this.log(actor, validationResult.valid ? 'VALIDATE' : 'VALIDATION_FAILED', 'EXTENSION_PACKAGE', finalVersion.id, finalVersion.version, {
      metadata: { validationId: validation.id, errorCount: validationResult.errors.length, warningCount: validationResult.warnings.length },
    });
    return finalVersion;
  }

  async validationReports(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Extension version not found');
    return this.prisma.extensionValidation.findMany({ where: { extensionVersionId: versionId }, orderBy: { startedAt: 'desc' } });
  }

  async themePreview(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: true, assets: true },
    });
    if (!version) throw new NotFoundException('Extension version not found');
    if (version.extension.runtimeType !== 'THEME') throw new BadRequestException('Preview is only available for theme extensions');
    if (!['VALIDATED', 'AWAITING_REVIEW', 'APPROVED', 'PUBLISHED', 'DEPRECATED'].includes(version.lifecycleStatus)) {
      throw new ConflictException('Theme must pass validation before preview');
    }
    const styleAsset = version.assets.find((asset) => asset.path.toLowerCase().split('/').pop() === 'style.css');
    const css = styleAsset ? (await this.storage.getPrivate(styleAsset.storageKey)).toString('utf8') : '';
    return { versionId: version.id, version: version.version, manifest: version.manifest, css };
  }

  async transition(versionId: string, nextStatus: string, reviewNotes: string | undefined, actor: Actor) {
    const existing = await this.prisma.extensionVersion.findUnique({ where: { id: versionId } });
    if (!existing) throw new NotFoundException('Extension version not found');
    if (existing.lifecycleStatus === nextStatus) return existing;
    const allowed = ALLOWED_TRANSITIONS[existing.lifecycleStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new ConflictException(`Cannot transition extension version from ${existing.lifecycleStatus} to ${nextStatus}`);
    }
    if ((nextStatus === 'APPROVED' || nextStatus === 'REJECTED') && !reviewNotes?.trim()) {
      throw new BadRequestException('reviewNotes are required when approving or rejecting a version');
    }
    let publishedStorageKey: string | undefined;
    if (nextStatus === 'PUBLISHED') {
      if (!existing.packageStorageKey || !existing.packageChecksum) {
        throw new ConflictException('A validated package artifact is required before publication');
      }
      publishedStorageKey = `published/extensions/${existing.extensionId}/${existing.id}/${existing.packageChecksum}.zip`;
      const packageContents = await this.storage.getPrivate(existing.packageStorageKey);
      await this.storage.putPrivate(publishedStorageKey, packageContents, 'application/zip');
    }
    const updated = await this.prisma.extensionVersion.update({
      where: { id: versionId },
      data: {
        lifecycleStatus: nextStatus,
        reviewNotes: reviewNotes?.trim() || undefined,
        reviewedBy: nextStatus === 'APPROVED' || nextStatus === 'REJECTED' ? actor.userId : undefined,
        publishedAt: nextStatus === 'PUBLISHED' ? new Date() : undefined,
        packageStorageKey: publishedStorageKey,
      },
    });
    if (nextStatus === 'PUBLISHED') {
      await this.prisma.extension.update({ where: { id: existing.extensionId }, data: { isListed: true, status: 'ACTIVE' } });
      await this.storage.deletePrivate(existing.packageStorageKey!).catch(() => undefined);
    }
    if (nextStatus === 'BLOCKED') {
      await this.prisma.extensionInstallation.updateMany({
        where: { installedVersionId: versionId, enabled: true },
        data: { enabled: false },
      });
    }
    await this.log(actor, 'STATUS_CHANGE', 'EXTENSION_VERSION', updated.id, updated.version, {
      changes: { before: { lifecycleStatus: existing.lifecycleStatus }, after: { lifecycleStatus: nextStatus } },
    });
    return updated;
  }

  async reviewSummary(versionId: string) {
    const version = await this.prisma.extensionVersion.findUnique({
      where: { id: versionId },
      include: { extension: { include: { versions: { where: { lifecycleStatus: { in: ['PUBLISHED', 'DEPRECATED'] } }, orderBy: { publishedAt: 'desc' } } } } },
    });
    if (!version) throw new NotFoundException('Extension version not found');
    const permissions = (version.manifest as Record<string, any>)?.permissions || [];
    const previous = version.extension.versions.find((candidate) => candidate.id !== version.id);
    const previousPermissions = previous ? ((previous.manifest as Record<string, any>)?.permissions || []) : [];
    return {
      versionId: version.id,
      compatibilityRange: version.compatibilityRange,
      previousVersion: previous?.version || null,
      permissions: {
        requested: permissions,
        added: permissions.filter((permission: string) => !previousPermissions.includes(permission)),
        removed: previousPermissions.filter((permission: string) => !permissions.includes(permission)),
      },
      warnings: version.compatibilityRange ? [] : ['No platform compatibility range declared'],
    };
  }

  private log(actor: Actor, action: string, resource: string, resourceId: string, resourceLabel: string, detail: Record<string, unknown>) {
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
