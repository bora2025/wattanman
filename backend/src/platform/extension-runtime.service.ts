import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { dateIdPage, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';
import { ExtensionSigningService } from './extension-signing.service';

interface RuntimeUser { userId?: string; role?: string }
const DEFAULT_EXTENSION_DATA_QUOTA_BYTES = 100 * 1024 * 1024;
const DEFAULT_EXTENSION_RECORD_QUOTA = 100_000;
const MAX_RECORD_BYTES = 1024 * 1024;

@Injectable()
export class ExtensionRuntimeService {
  constructor(private prisma: PrismaService, private audit: AuditService, private signing: ExtensionSigningService) {}

  async navigation(user: RuntimeUser) {
    const installations = await this.prisma.extensionInstallation.findMany({
      where: { enabled: true, extension: { runtimeType: 'DECLARATIVE_MODULE', status: 'ACTIVE' } },
      include: { extension: true, installedVersion: { include: { signingKey: true } } },
    });
    await Promise.all(installations.map((installation) => this.verifyInstallation(installation)));
    return installations.flatMap((installation) => {
      const manifest = installation.installedVersion.manifest as Record<string, any>;
      return (manifest.navigation || [])
        .filter((item: any) => Array.isArray(item.roles) && item.roles.includes(user.role))
        .map((item: any) => ({
          label: item.label,
          href: `/extensions/${installation.extension.key}/${item.pageKey}`,
          icon: item.icon || 'design',
          section: item.section || 'Extensions',
        }));
    });
  }

  async page(extensionKey: string, pageKey: string, user: RuntimeUser) {
    const installation = await this.installation(extensionKey);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    const page = (manifest.pages || []).find((candidate: any) => candidate.key === pageKey);
    if (!page) throw new NotFoundException('Extension page not found');
    if (!page.roles?.includes(user.role)) throw new ForbiddenException('Your role cannot access this extension page');
    return {
      extension: { key: installation.extension.key, name: installation.extension.name },
      page,
      defaultLocale: manifest.defaultLocale || 'en',
      translations: manifest.translations || {},
    };
  }

  async records(extensionKey: string, resource: string, user: RuntimeUser, cursorValue?: string, limitValue?: string, filtersValue?: string) {
    const installation = await this.authorize(extensionKey, resource, 'read', user);
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const filters = this.parseFilters((installation.installedVersion.manifest as any).resources[resource], filtersValue);
    const rows = await this.prisma.extensionRecord.findMany({
      where: {
        installationId: installation.id,
        extensionId: installation.extensionId,
        resource,
        ...(filters.length ? { AND: filters.map(([field, value]) => ({ data: { path: [field], equals: value } })) } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async createRecord(extensionKey: string, resource: string, data: Record<string, unknown>, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    this.validateData(manifest.resources[resource], data);
    const schoolId = getCurrentSchoolId();
    const byteSize = this.byteSize(data);
    if (byteSize > MAX_RECORD_BYTES) throw new PayloadTooLargeException('Extension record exceeds the 1MB limit');
    const record = await this.prisma.$transaction(async (transaction) => {
      await this.reserveCapacity(transaction, installation.id, schoolId, byteSize, 1);
      return transaction.extensionRecord.create({
        data: {
          schoolId,
          extensionId: installation.extensionId,
          installationId: installation.id,
          versionId: installation.installedVersionId,
          resource,
          data: data as any,
          byteSize,
          schemaVersion: installation.installedVersion.manifestSchema || 1,
          createdBy: user.userId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.logMutation(user, 'CREATE', installation, resource, record.id, { byteSize, concurrencyVersion: record.concurrencyVersion });
    return record;
  }

  async updateRecord(extensionKey: string, resource: string, recordId: string, data: Record<string, unknown>, user: RuntimeUser, expectedVersionValue?: string) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    this.validateData(manifest.resources[resource], data);
    const schoolId = getCurrentSchoolId();
    const byteSize = this.byteSize(data);
    if (byteSize > MAX_RECORD_BYTES) throw new PayloadTooLargeException('Extension record exceeds the 1MB limit');
    const expectedVersion = this.expectedVersion(expectedVersionValue);
    const record = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.extensionRecord.findFirst({ where: { id: recordId, schoolId, installationId: installation.id, extensionId: installation.extensionId, resource } });
      if (!record) throw new NotFoundException('Extension record not found');
      if (record.concurrencyVersion !== expectedVersion) throw new ConflictException('Extension record was modified by another request');
      await this.adjustBytes(transaction, installation.id, schoolId, byteSize - record.byteSize);
      const updated = await transaction.extensionRecord.updateMany({
        where: { id: recordId, concurrencyVersion: expectedVersion },
        data: { data: data as any, byteSize, versionId: installation.installedVersionId, schemaVersion: installation.installedVersion.manifestSchema || 1, concurrencyVersion: { increment: 1 }, updatedBy: user.userId },
      });
      if (updated.count !== 1) throw new ConflictException('Extension record was modified by another request');
      return transaction.extensionRecord.findUnique({ where: { id: recordId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.logMutation(user, 'UPDATE', installation, resource, recordId, { byteSize, concurrencyVersion: record.concurrencyVersion });
    return record;
  }

  async deleteRecord(extensionKey: string, resource: string, recordId: string, user: RuntimeUser, expectedVersionValue?: string) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const schoolId = getCurrentSchoolId();
    const expectedVersion = this.expectedVersion(expectedVersionValue);
    await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.extensionRecord.findFirst({ where: { id: recordId, schoolId, installationId: installation.id, extensionId: installation.extensionId, resource } });
      if (!record) throw new NotFoundException('Extension record not found');
      if (record.concurrencyVersion !== expectedVersion) throw new ConflictException('Extension record was modified by another request');
      await this.adjustBytes(transaction, installation.id, schoolId, -record.byteSize);
      const deleted = await transaction.extensionRecord.deleteMany({ where: { id: recordId, concurrencyVersion: expectedVersion } });
      if (deleted.count !== 1) throw new ConflictException('Extension record was modified by another request');
      await transaction.extensionInstallation.updateMany({ where: { id: installation.id, schoolId, dataRecords: { gt: 0 } }, data: { dataRecords: { decrement: 1 } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.logMutation(user, 'DELETE', installation, resource, recordId, { concurrencyVersion: expectedVersion });
    return { deleted: true, id: recordId };
  }

  async exportRecords(extensionKey: string, resource: string, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'read', user);
    const rows = await this.prisma.extensionRecord.findMany({
      where: { installationId: installation.id, extensionId: installation.extensionId, resource },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 10_001,
    });
    if (rows.length > 10_000) throw new PayloadTooLargeException('Extension export exceeds the 10,000 record limit');
    await this.audit.log({
      actorId: user.userId, actorRole: user.role, action: 'EXPORT', resource: 'EXTENSION_RECORD',
      resourceId: installation.extension.key, resourceLabel: installation.extension.name,
      metadata: { extensionId: installation.extensionId, installationId: installation.id, versionId: installation.installedVersionId, resource, records: rows.length },
    });
    return { extensionKey, installationId: installation.id, versionId: installation.installedVersionId, resource, exportedAt: new Date().toISOString(), records: rows };
  }

  private byteSize(data: Record<string, unknown>) {
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  private async reserveCapacity(transaction: any, installationId: string, schoolId: string, bytes: number, records = 0) {
    const byteQuota = this.quota('EXTENSION_DATA_QUOTA_BYTES', DEFAULT_EXTENSION_DATA_QUOTA_BYTES, 1024 * 1024, 10 * 1024 * 1024 * 1024);
    const recordQuota = this.quota('EXTENSION_RECORD_QUOTA', DEFAULT_EXTENSION_RECORD_QUOTA, 100, 10_000_000);
    const reserved = await transaction.extensionInstallation.updateMany({
      where: { id: installationId, schoolId, dataBytes: { lte: byteQuota - bytes }, dataRecords: { lte: recordQuota - records } },
      data: { dataBytes: { increment: bytes }, ...(records ? { dataRecords: { increment: records } } : {}) },
    });
    if (reserved.count !== 1) throw new PayloadTooLargeException('Extension data or record quota exceeded');
  }

  private async adjustBytes(transaction: any, installationId: string, schoolId: string, delta: number) {
    if (delta > 0) return this.reserveCapacity(transaction, installationId, schoolId, delta);
    if (delta < 0) {
      await transaction.extensionInstallation.updateMany({
        where: { id: installationId, schoolId },
        data: { dataBytes: { decrement: -delta } },
      });
    }
  }

  private parseFilters(schema: any, value?: string): Array<[string, string | number | boolean]> {
    if (!value) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new BadRequestException('filters must be a JSON object'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('filters must be a JSON object');
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > 5) throw new BadRequestException('At most five filters are allowed');
    const fields = new Map((schema?.fields || []).map((field: any) => [field.key, field]));
    for (const [key, filterValue] of entries) {
      const field: any = fields.get(key);
      if (!field) throw new BadRequestException(`Unknown filter field: ${key}`);
      if (!['string', 'number', 'boolean'].includes(typeof filterValue)) throw new BadRequestException(`Invalid filter value: ${key}`);
      if (field.type === 'number' && typeof filterValue !== 'number') throw new BadRequestException(`${key} filter must be a number`);
      if (field.type === 'boolean' && typeof filterValue !== 'boolean') throw new BadRequestException(`${key} filter must be a boolean`);
      if ((field.type === 'text' || field.type === 'date') && typeof filterValue !== 'string') throw new BadRequestException(`${key} filter must be text`);
    }
    return entries as Array<[string, string | number | boolean]>;
  }

  private expectedVersion(value?: string) {
    const normalized = value?.replace(/^W\//, '').replace(/^"|"$/g, '');
    const parsed = Number.parseInt(normalized || '', 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new BadRequestException('If-Match must contain the current record concurrency version');
    return parsed;
  }

  private quota(name: string, fallback: number, minimum: number, maximum: number) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
  }

  private logMutation(user: RuntimeUser, action: string, installation: any, resource: string, recordId: string, metadata: Record<string, unknown>) {
    return this.audit.log({
      actorId: user.userId, actorRole: user.role, action, resource: 'EXTENSION_RECORD', resourceId: recordId,
      resourceLabel: `${installation.extension.key}:${resource}`,
      metadata: { schoolId: installation.schoolId, extensionId: installation.extensionId, installationId: installation.id, versionId: installation.installedVersionId, resource, ...metadata },
    });
  }

  private async authorize(extensionKey: string, resource: string, action: 'read' | 'write', user: RuntimeUser) {
    const installation = await this.installation(extensionKey);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    if (!(manifest.permissions || []).includes(`${resource}:${action}`)) {
      await this.audit.log({
        actorId: user.userId,
        actorRole: user.role,
        action: 'CAPABILITY_DENIED',
        resource: 'EXTENSION_RUNTIME',
        resourceId: installation.extension.key,
        resourceLabel: installation.extension.name,
        success: false,
        errorMessage: `Extension did not declare ${resource}:${action}`,
        metadata: { extensionId: installation.extensionId, capability: `${resource}:${action}` },
      });
      throw new ForbiddenException(`Extension did not declare ${resource}:${action}`);
    }
    const roleAllowed = (manifest.pages || []).some((page: any) => page.resource === resource && page.roles?.includes(user.role));
    if (!roleAllowed) throw new ForbiddenException('Your role cannot access this extension resource');
    if (!manifest.resources?.[resource]) throw new NotFoundException('Extension resource not found');
    return installation;
  }

  private async installation(extensionKey: string) {
    const installation = await this.prisma.extensionInstallation.findFirst({
      where: { enabled: true, extension: { key: extensionKey, runtimeType: 'DECLARATIVE_MODULE', status: 'ACTIVE' } },
      include: { extension: true, installedVersion: { include: { signingKey: true } } },
    });
    if (!installation || installation.installedVersion.lifecycleStatus !== 'PUBLISHED') throw new NotFoundException('Extension is not active for this school');
    await this.verifyInstallation(installation);
    return installation;
  }

  private async verifyInstallation(installation: any) {
    if (installation.extension.runtimeType !== 'CORE_MODULE') {
      await this.signing.verifyForRuntime(installation.installedVersion);
    }
  }

  private validateData(schema: any, data: Record<string, unknown>) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadRequestException('Record data must be an object');
    const fields = Array.isArray(schema?.fields) ? schema.fields : [];
    const allowed = new Set(fields.map((field: any) => field.key));
    for (const key of Object.keys(data)) if (!allowed.has(key)) throw new BadRequestException(`Unknown field: ${key}`);
    for (const field of fields) {
      const value = data[field.key];
      if (field.required && (value === undefined || value === null || value === '')) throw new BadRequestException(`${field.key} is required`);
      if (value == null) continue;
      if (field.type === 'number' && typeof value !== 'number') throw new BadRequestException(`${field.key} must be a number`);
      if (field.type === 'boolean' && typeof value !== 'boolean') throw new BadRequestException(`${field.key} must be a boolean`);
      if ((field.type === 'text' || field.type === 'date') && typeof value !== 'string') throw new BadRequestException(`${field.key} must be text`);
    }
  }
}
