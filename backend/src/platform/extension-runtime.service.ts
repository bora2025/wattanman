import { BadRequestException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';

interface RuntimeUser { userId?: string; role?: string }
const EXTENSION_DATA_QUOTA_BYTES = 100 * 1024 * 1024;

@Injectable()
export class ExtensionRuntimeService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async navigation(user: RuntimeUser) {
    const installations = await this.prisma.extensionInstallation.findMany({
      where: { enabled: true, extension: { runtimeType: 'DECLARATIVE_MODULE', status: 'ACTIVE' } },
      include: { extension: true, installedVersion: true },
    });
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

  async records(extensionKey: string, resource: string, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'read', user);
    return this.prisma.extensionRecord.findMany({
      where: { extensionId: installation.extensionId, resource },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRecord(extensionKey: string, resource: string, data: Record<string, unknown>, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    this.validateData(manifest.resources[resource], data);
    const schoolId = getCurrentSchoolId();
    const byteSize = this.byteSize(data);
    return this.prisma.$transaction(async (transaction) => {
      await this.reserveBytes(transaction, installation.id, schoolId, byteSize);
      return transaction.extensionRecord.create({
        data: {
          schoolId,
          extensionId: installation.extensionId,
          resource,
          data: data as any,
          byteSize,
          createdBy: user.userId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateRecord(extensionKey: string, resource: string, recordId: string, data: Record<string, unknown>, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    this.validateData(manifest.resources[resource], data);
    const schoolId = getCurrentSchoolId();
    const byteSize = this.byteSize(data);
    return this.prisma.$transaction(async (transaction) => {
      const record = await transaction.extensionRecord.findFirst({ where: { id: recordId, schoolId, extensionId: installation.extensionId, resource } });
      if (!record) throw new NotFoundException('Extension record not found');
      await this.adjustBytes(transaction, installation.id, schoolId, byteSize - record.byteSize);
      return transaction.extensionRecord.update({ where: { id: recordId }, data: { data: data as any, byteSize, updatedBy: user.userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteRecord(extensionKey: string, resource: string, recordId: string, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const schoolId = getCurrentSchoolId();
    await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.extensionRecord.findFirst({ where: { id: recordId, schoolId, extensionId: installation.extensionId, resource } });
      if (!record) throw new NotFoundException('Extension record not found');
      await this.adjustBytes(transaction, installation.id, schoolId, -record.byteSize);
      await transaction.extensionRecord.delete({ where: { id: recordId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { deleted: true, id: recordId };
  }

  private byteSize(data: Record<string, unknown>) {
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  private async reserveBytes(transaction: any, installationId: string, schoolId: string, bytes: number) {
    const reserved = await transaction.extensionInstallation.updateMany({
      where: { id: installationId, schoolId, dataBytes: { lte: EXTENSION_DATA_QUOTA_BYTES - bytes } },
      data: { dataBytes: { increment: bytes } },
    });
    if (reserved.count !== 1) throw new PayloadTooLargeException('Extension data quota exceeded');
  }

  private async adjustBytes(transaction: any, installationId: string, schoolId: string, delta: number) {
    if (delta > 0) return this.reserveBytes(transaction, installationId, schoolId, delta);
    if (delta < 0) {
      await transaction.extensionInstallation.updateMany({
        where: { id: installationId, schoolId },
        data: { dataBytes: { decrement: -delta } },
      });
    }
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

  private installation(extensionKey: string) {
    return this.prisma.extensionInstallation.findFirst({
      where: { enabled: true, extension: { key: extensionKey, runtimeType: 'DECLARATIVE_MODULE', status: 'ACTIVE' } },
      include: { extension: true, installedVersion: true },
    }).then((installation) => {
      if (!installation || installation.installedVersion.lifecycleStatus !== 'PUBLISHED') throw new NotFoundException('Extension is not active for this school');
      return installation;
    });
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
