import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Actor { userId?: string; role?: string; name?: string; email?: string }

@Injectable()
export class ExtensionControlService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list() {
    return this.prisma.extensionKillSwitch.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }], take: 500 });
  }

  async set(input: { scopeType?: string; scopeId?: string; capability?: string; active?: boolean; reason?: string }, actor: Actor) {
    const scopeType = input.scopeType?.trim().toUpperCase();
    const scopeId = input.scopeId?.trim();
    const capability = input.capability?.trim().toLowerCase() || '';
    if (!['PUBLISHER', 'EXTENSION', 'VERSION', 'SCHOOL', 'CAPABILITY'].includes(scopeType || '')) throw new BadRequestException('Invalid extension kill-switch scope');
    if (!scopeId) throw new BadRequestException('Kill-switch scopeId is required');
    if (scopeType === 'CAPABILITY' && !/^[a-z][a-z0-9_-]*:(read|write)$/.test(capability || '')) throw new BadRequestException('Capability scope requires a valid capability');
    if (scopeType !== 'CAPABILITY' && capability) throw new BadRequestException('Capability is only valid for CAPABILITY scope');
    if (!input.reason?.trim()) throw new BadRequestException('Kill-switch reason is required');
    await this.assertScopeExists(scopeType!, scopeId);
    const active = input.active !== false;
    const updated = await this.prisma.extensionKillSwitch.upsert({
      where: { scopeType_scopeId_capability: { scopeType: scopeType!, scopeId, capability } },
      create: { scopeType: scopeType!, scopeId, capability, active, reason: input.reason.trim(), activatedBy: active ? actor.userId : null, activatedAt: new Date(), deactivatedBy: active ? null : actor.userId, deactivatedAt: active ? null : new Date() },
      update: { active, reason: input.reason.trim(), ...(active ? { activatedBy: actor.userId, activatedAt: new Date(), deactivatedBy: null, deactivatedAt: null } : { deactivatedBy: actor.userId, deactivatedAt: new Date() }) },
    });
    await this.audit.log({ actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: active ? 'KILL_SWITCH_ACTIVATE' : 'KILL_SWITCH_DEACTIVATE', resource: 'EXTENSION_CONTROL', resourceId: updated.id, resourceLabel: `${scopeType}:${scopeId}${capability ? `:${capability}` : ''}`, metadata: { scopeType, scopeId, capability, reason: input.reason.trim() } });
    return updated;
  }

  async assertAllowed(installation: any, capability?: string) {
    const schoolId = installation.schoolId;
    const extensionId = installation.extensionId;
    const versionId = installation.installedVersionId;
    const publisherId = installation.extension.publisherId;
    const conditions: any[] = [
      { scopeType: 'PUBLISHER', scopeId: publisherId },
      { scopeType: 'EXTENSION', scopeId: extensionId },
      { scopeType: 'VERSION', scopeId: versionId },
      { scopeType: 'SCHOOL', scopeId: schoolId },
    ];
    if (capability) conditions.push({ scopeType: 'CAPABILITY', scopeId: extensionId, capability });
    const blocked = await this.prisma.extensionKillSwitch.findFirst({ where: { active: true, OR: conditions }, orderBy: { activatedAt: 'desc' } });
    if (blocked) throw new ForbiddenException(`Extension access disabled by ${blocked.scopeType.toLowerCase()} control: ${blocked.reason}`);
  }

  private async assertScopeExists(scopeType: string, scopeId: string) {
    const found = scopeType === 'PUBLISHER' ? await this.prisma.extensionPublisher.findUnique({ where: { id: scopeId }, select: { id: true } })
      : scopeType === 'EXTENSION' || scopeType === 'CAPABILITY' ? await this.prisma.extension.findUnique({ where: { id: scopeId }, select: { id: true } })
      : scopeType === 'VERSION' ? await this.prisma.extensionVersion.findUnique({ where: { id: scopeId }, select: { id: true } })
      : await this.prisma.school.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!found) throw new NotFoundException(`${scopeType.toLowerCase()} kill-switch target not found`);
  }
}
