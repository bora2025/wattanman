import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';

interface RuntimeUser { userId?: string; role?: string }

@Injectable()
export class ExtensionRuntimeService {
  constructor(private prisma: PrismaService) {}

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
    return { extension: { key: installation.extension.key, name: installation.extension.name }, page };
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
    return this.prisma.extensionRecord.create({
      data: {
        schoolId: getCurrentSchoolId(),
        extensionId: installation.extensionId,
        resource,
        data: data as any,
        createdBy: user.userId,
      },
    });
  }

  async updateRecord(extensionKey: string, resource: string, recordId: string, data: Record<string, unknown>, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    this.validateData(manifest.resources[resource], data);
    const record = await this.prisma.extensionRecord.findFirst({ where: { id: recordId, extensionId: installation.extensionId, resource } });
    if (!record) throw new NotFoundException('Extension record not found');
    return this.prisma.extensionRecord.update({ where: { id: recordId }, data: { data: data as any, updatedBy: user.userId } });
  }

  async deleteRecord(extensionKey: string, resource: string, recordId: string, user: RuntimeUser) {
    const installation = await this.authorize(extensionKey, resource, 'write', user);
    const record = await this.prisma.extensionRecord.findFirst({ where: { id: recordId, extensionId: installation.extensionId, resource } });
    if (!record) throw new NotFoundException('Extension record not found');
    await this.prisma.extensionRecord.delete({ where: { id: recordId } });
    return { deleted: true, id: recordId };
  }

  private async authorize(extensionKey: string, resource: string, action: 'read' | 'write', user: RuntimeUser) {
    const installation = await this.installation(extensionKey);
    const manifest = installation.installedVersion.manifest as Record<string, any>;
    if (!(manifest.permissions || []).includes(`${resource}:${action}`)) throw new ForbiddenException(`Extension did not declare ${resource}:${action}`);
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
