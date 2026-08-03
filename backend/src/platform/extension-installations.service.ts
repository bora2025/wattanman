import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { R2StorageService } from '../storage/r2-storage.service';
import { ExtensionSigningService } from './extension-signing.service';

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

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
        status: 'ACTIVE',
        versions: { some: { lifecycleStatus: 'PUBLISHED' } },
        OR: [{ visibility: 'LISTED' }, { visibility: 'PRIVATE', visibilityGrants: { some: { schoolId } } }],
      },
      include: { versions: { where: { lifecycleStatus: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  schoolInstallations() {
    return this.prisma.extensionInstallation.findMany({
      include: { extension: true, installedVersion: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async request(extensionId: string, actor: Actor) {
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: 'ACTIVE',
        OR: [{ visibility: { in: ['LISTED', 'UNLISTED'] } }, { visibility: 'PRIVATE', visibilityGrants: { some: { schoolId } } }],
      },
      include: { versions: { where: { lifecycleStatus: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
    });
    if (!extension || !extension.versions[0]) throw new NotFoundException('No published extension version is available');
    const existing = await this.prisma.extensionInstallation.findFirst({ where: { extensionId } });
    if (existing?.enabled) throw new ConflictException('Extension is already active for this school');
    const installation = existing
      ? await this.prisma.extensionInstallation.update({
          where: { id: existing.id },
          data: { requestedAt: new Date(), requestedBy: actor.userId, uninstalledAt: null, purgeAfter: null },
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
    await this.log(actor, 'REQUEST', installation.id, extension.name, { extensionId, schoolId });
    return installation;
  }

  platformInstallations(schoolId?: string) {
    return this.prisma.extensionInstallation.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: {
        school: true,
        extension: { include: { versions: { where: { lifecycleStatus: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } } } },
        installedVersion: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async approve(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.requestedAt) throw new ConflictException('School has not requested this extension');
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { approvedAt: new Date(), approvedBy: actor.userId },
    });
    await this.log(actor, 'APPROVE', updated.id, existing.extension.name, { schoolId: existing.schoolId, extensionId: existing.extensionId });
    return updated;
  }

  async install(installationId: string, versionId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.approvedAt) throw new ConflictException('Extension request must be approved before installation');
    const version = await this.prisma.extensionVersion.findFirst({
      where: { id: versionId, extensionId: existing.extensionId, lifecycleStatus: 'PUBLISHED' },
      include: { assets: true, signingKey: true },
    });
    if (!version) throw new NotFoundException('Published extension version not found for this extension');
    if (existing.extension.runtimeType === 'DECLARATIVE_MODULE') await this.assertDependencies(existing.schoolId, existing.extension.key, version);
    if (existing.extension.runtimeType !== 'CORE_MODULE') await this.signing.verifyPublished(version);
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
    await this.log(actor, 'INSTALL', updated.id, existing.extension.name, { schoolId: existing.schoolId, extensionId: existing.extensionId, versionId });
    return updated;
  }

  async upgrade(installationId: string, versionId: string, actor: Actor, acknowledgePermissions = false) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.installedAt) throw new ConflictException('Extension must be installed before it can be upgraded');
    if (existing.installedVersionId === versionId) return existing;
    const version = await this.prisma.extensionVersion.findFirst({
      where: { id: versionId, extensionId: existing.extensionId, lifecycleStatus: 'PUBLISHED' },
      include: { assets: true, signingKey: true },
    });
    if (!version) throw new NotFoundException('Published upgrade version not found for this extension');
    if (existing.extension.runtimeType === 'DECLARATIVE_MODULE') await this.assertDependencies(existing.schoolId, existing.extension.key, version, installationId);
    if (existing.extension.runtimeType !== 'CORE_MODULE') await this.signing.verifyPublished(version);
    const permissionReview = this.permissionReview(existing.installedVersion, version);
    if (permissionReview.added.length && !acknowledgePermissions) {
      throw new ConflictException(`Upgrade requests new permissions: ${permissionReview.added.join(', ')}`);
    }
    let configuration = (existing.configuration as Record<string, any> | null) || {};
    if (existing.enabled && existing.extension.runtimeType === 'THEME') {
      await this.applyThemeVersion(existing.schoolId, version);
      configuration = { ...configuration, rollbackVersionId: existing.installedVersionId, activeThemeVersionId: version.id };
    }
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { installedVersionId: version.id, installedBy: actor.userId, installedAt: new Date(), configuration, availableVersionId: null, updateNotifiedAt: null },
    });
    await this.log(actor, 'UPGRADE', updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromVersionId: existing.installedVersionId,
      toVersionId: version.id,
      permissionReview,
    });
    return updated;
  }

  async setUpdatePolicy(installationId: string, policy: string, actor: Actor) {
    if (!['MANUAL', 'NOTIFY', 'AUTO_APPROVED'].includes(policy)) {
        throw new BadRequestException('Update policy must be MANUAL, NOTIFY, or AUTO_APPROVED');
    }
    const existing = await this.requireInstallation(installationId);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { updatePolicy: policy },
    });
    await this.log(actor, 'UPDATE_POLICY', updated.id, existing.extension.name, {
      schoolId: existing.schoolId, extensionId: existing.extensionId, before: existing.updatePolicy, after: policy,
    });
    return updated;
  }

  async upgradeReview(installationId: string, versionId: string) {
    const existing = await this.requireInstallation(installationId);
    const version = await this.prisma.extensionVersion.findFirst({
      where: { id: versionId, extensionId: existing.extensionId, lifecycleStatus: 'PUBLISHED' },
    });
    if (!version) throw new NotFoundException('Published upgrade version not found for this extension');
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
      where: { id: versionId, extensionId: existing.extensionId, lifecycleStatus: 'PUBLISHED' },
    });
    if (!version) throw new NotFoundException('Published extension version not found for this extension');
    return this.resolveDependencies(existing.schoolId, existing.extension.key, version, installationId);
  }

  async rollback(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const configuration = (existing.configuration as Record<string, any> | null) || {};
    const rollbackVersionId = configuration.rollbackVersionId;
    if (!rollbackVersionId) throw new ConflictException('No rollback version is available');
    const version = await this.prisma.extensionVersion.findFirst({
      where: { id: rollbackVersionId, extensionId: existing.extensionId, lifecycleStatus: { in: ['PUBLISHED', 'DEPRECATED'] } },
      include: { assets: true, signingKey: true },
    });
    if (!version) throw new NotFoundException('Rollback version is unavailable or blocked');
    if (existing.extension.runtimeType !== 'CORE_MODULE') await this.signing.verifyPublished(version);
    if (existing.enabled && existing.extension.runtimeType === 'THEME') await this.applyThemeVersion(existing.schoolId, version);
    const updatedConfiguration = { ...configuration, rollbackVersionId: existing.installedVersionId, activeThemeVersionId: version.id };
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { installedVersionId: version.id, configuration: updatedConfiguration },
    });
    await this.log(actor, 'ROLLBACK', updated.id, existing.extension.name, {
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
      throw new ConflictException('Extension must be approved and installed before activation');
    }
    if (enabled && existing.installedVersion.lifecycleStatus !== 'PUBLISHED') {
      throw new ConflictException('Only a published extension version can be activated');
    }
    if (enabled && existing.extension.runtimeType === 'DECLARATIVE_MODULE') await this.assertDependencies(existing.schoolId, existing.extension.key, existing.installedVersion, installationId);
    if (enabled && existing.extension.runtimeType !== 'CORE_MODULE') await this.signing.verifyPublished(existing.installedVersion);
    let configuration = existing.configuration as Record<string, any> | null;
    if (existing.extension.runtimeType === 'THEME') {
      if (enabled) {
        const manifest = existing.installedVersion.manifest as Record<string, any>;
        const styleAsset = existing.installedVersion.assets.find((asset) => asset.path.toLowerCase().split('/').pop() === 'style.css');
        const css = styleAsset ? (await this.storage.getPrivate(styleAsset.storageKey)).toString('utf8') : '';
        const current = await this.prisma.siteSetting.findUnique({ where: { schoolId: existing.schoolId } });
        configuration = {
          ...(configuration || {}),
          previousTheme: current ? {
            mode: current.mode,
            primaryColor: current.primaryColor,
            secondaryColor: current.secondaryColor,
            font: current.font,
            radius: current.radius,
            customCss: current.customCss,
          } : null,
          activeThemeVersionId: existing.installedVersionId,
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
        await this.prisma.siteSetting.update({ where: { schoolId: existing.schoolId }, data: configuration.previousTheme });
      }
    }
    const updated = await this.prisma.extensionInstallation.update({ where: { id: installationId }, data: { enabled, configuration } });
    await this.log(actor, enabled ? 'ACTIVATE' : 'DEACTIVATE', updated.id, existing.extension.name, { schoolId: existing.schoolId, extensionId: existing.extensionId });
    return updated;
  }

  async uninstall(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const installations = (await this.prisma.extensionInstallation.findMany({
      where: { schoolId: existing.schoolId, enabled: true, id: { not: installationId } },
      include: { extension: true, installedVersion: true },
    })) || [];
    const dependents = installations.filter((installation) => (((installation.installedVersion.manifest as Record<string, any>)?.dependencies || []) as Array<{ key: string; optional: boolean }>).some((dependency) => dependency.key === existing.extension.key && !dependency.optional));
    if (dependents.length) throw new ConflictException(`Cannot uninstall while required by: ${dependents.map((installation) => installation.extension.name).join(', ')}`);
    const configuration = existing.configuration as Record<string, any> | null;
    if (existing.enabled && existing.extension.runtimeType === 'THEME' && configuration?.previousTheme) {
      await this.prisma.siteSetting.update({ where: { schoolId: existing.schoolId }, data: configuration.previousTheme });
    }
    const uninstalledAt = new Date();
    const purgeAfter = new Date(uninstalledAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { enabled: false, uninstalledAt, purgeAfter },
    });
    await this.log(actor, 'UNINSTALL', updated.id, existing.extension.name, { schoolId: existing.schoolId, extensionId: existing.extensionId, purgeAfter: purgeAfter.toISOString() });
    return updated;
  }

  private async requireInstallation(id: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id },
      include: { extension: true, installedVersion: { include: { assets: true, signingKey: true } } },
    });
    if (!installation) throw new NotFoundException('Extension installation not found');
    return installation;
  }

  private permissionReview(currentVersion: { manifest: unknown }, targetVersion: { manifest: unknown }) {
    const current = ((currentVersion.manifest as Record<string, any>)?.permissions || []) as string[];
    const target = ((targetVersion.manifest as Record<string, any>)?.permissions || []) as string[];
    return {
      requested: target,
      added: target.filter((permission) => !current.includes(permission)),
      removed: current.filter((permission) => !target.includes(permission)),
    };
  }

  private async assertDependencies(schoolId: string, extensionKey: string, version: { version: string; manifest: unknown }, excludedInstallationId?: string) {
    const review = await this.resolveDependencies(schoolId, extensionKey, version, excludedInstallationId);
    const missing = review.dependencies.filter((dependency) => !dependency.optional && dependency.status !== 'SATISFIED');
    if (missing.length) throw new ConflictException(`Required extensions are unavailable: ${missing.map((dependency) => `${dependency.key} (${dependency.status})`).join(', ')}`);
    if (review.conflicts.length) throw new ConflictException(`Conflicting extensions are active: ${review.conflicts.join(', ')}`);
  }

  private async resolveDependencies(schoolId: string, extensionKey: string, version: { version: string; manifest: unknown }, excludedInstallationId?: string) {
    const manifest = (version.manifest as Record<string, any>) || {};
    const dependencies = (manifest.dependencies || []) as Array<{ key: string; versionRange?: string; optional: boolean }>;
    const declaredConflicts = new Set<string>((manifest.conflicts || []) as string[]);
    const installations = (await this.prisma.extensionInstallation.findMany({
      where: { schoolId, enabled: true, ...(excludedInstallationId ? { id: { not: excludedInstallationId } } : {}) },
      include: { extension: true, installedVersion: true },
    })) || [];
    const active = new Map(installations.map((installation) => [installation.extension.key, installation]));
    const resolved = dependencies.map((dependency) => {
      const installation = active.get(dependency.key);
      const status = !installation
        ? 'MISSING'
        : dependency.versionRange && !this.versionMatches(installation.installedVersion.version, dependency.versionRange)
          ? 'INCOMPATIBLE'
          : 'SATISFIED';
      return { ...dependency, status, installedVersion: installation?.installedVersion.version || null };
    });
    const conflicts = installations.filter((installation) => {
      const reverse = (((installation.installedVersion.manifest as Record<string, any>)?.conflicts || []) as string[]).includes(extensionKey);
      return declaredConflicts.has(installation.extension.key) || reverse;
    }).map((installation) => installation.extension.key);
    return { extensionKey, version: version.version, dependencies: resolved, conflicts };
  }

  private versionMatches(version: string, range: string) {
    const current = version.split('-')[0].split('.').map(Number);
    return range.split(/\s+/).every((comparator) => {
      const operator = comparator.match(/^(>=|>|<=|<)/)?.[1];
      const target = comparator.replace(/^(>=|>|<=|<)/, '').split('.').map(Number);
      const comparison = current[0] - target[0] || current[1] - target[1] || current[2] - target[2];
      return operator === '>=' ? comparison >= 0 : operator === '>' ? comparison > 0 : operator === '<=' ? comparison <= 0 : comparison < 0;
    });
  }

  private async applyThemeVersion(schoolId: string, version: { manifest: any; assets: Array<{ path: string; storageKey: string }> }) {
    const manifest = version.manifest as Record<string, any>;
    const styleAsset = version.assets.find((asset) => asset.path.toLowerCase().split('/').pop() === 'style.css');
    const customCss = styleAsset ? (await this.storage.getPrivate(styleAsset.storageKey)).toString('utf8') : '';
    await this.prisma.siteSetting.upsert({
      where: { schoolId },
      update: {
        mode: manifest.mode,
        primaryColor: manifest.tokens.primaryColor,
        secondaryColor: manifest.tokens.secondaryColor,
        font: manifest.tokens.font,
        radius: manifest.tokens.radius,
        customCss,
      },
      create: {
        schoolId,
        mode: manifest.mode,
        primaryColor: manifest.tokens.primaryColor,
        secondaryColor: manifest.tokens.secondaryColor,
        font: manifest.tokens.font,
        radius: manifest.tokens.radius,
        customCss,
      },
    });
  }

  private log(actor: Actor, action: string, resourceId: string, resourceLabel: string, metadata: Record<string, unknown>) {
    return this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      action,
      resource: 'EXTENSION_INSTALLATION',
      resourceId,
      resourceLabel,
      metadata,
    });
  }
}
