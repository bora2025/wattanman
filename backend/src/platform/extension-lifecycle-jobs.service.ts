import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { PrismaService } from '../database/prisma.service';
import { getCurrentSchoolId, getTenantStore } from '../tenancy/tenant-context';
import { DistributedLockService } from '../security/distributed-lock.service';
import { ExtensionInstallationsService } from './extension-installations.service';
import { ExtensionsService } from './extensions.service';

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

export type ExtensionLifecycleCommand =
  | 'INSTALL'
  | 'UPGRADE'
  | 'ROLLBACK'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'UNINSTALL'
  | 'PURGE_INSTALLATION'
  | 'PURGE_EXTENSION';

@Injectable()
export class ExtensionLifecycleJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueInfrastructureService,
    private readonly locks: DistributedLockService,
    private readonly installations: ExtensionInstallationsService,
    private readonly extensions: ExtensionsService,
  ) {}

  async submitInstallation(
    installationId: string,
    command: Exclude<ExtensionLifecycleCommand, 'PURGE_EXTENSION'>,
    payload: Record<string, unknown>,
    actor: Actor,
    idempotencyKey: string,
  ) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: installationId },
      select: { schoolId: true, extensionId: true, configuration: true },
    });
    if (!installation) throw new NotFoundException('Extension installation not found');
    return this.submit({
      schoolId: installation.schoolId,
      extensionId: installation.extensionId,
      installationId,
      command,
      payload: command === 'ROLLBACK'
        ? { ...payload, targetVersionId: (installation.configuration as Record<string, any> | null)?.rollbackVersionId }
        : payload,
      actor,
      idempotencyKey,
    });
  }

  async submitExtension(
    extensionId: string,
    payload: { reason?: string },
    actor: Actor,
    idempotencyKey: string,
  ) {
    const extension = await this.prisma.extension.findUnique({ where: { id: extensionId }, select: { id: true } });
    if (!extension) throw new NotFoundException('Extension not found');
    return this.submit({
      schoolId: getCurrentSchoolId(),
      extensionId,
      installationId: null,
      command: 'PURGE_EXTENSION',
      payload,
      actor,
      idempotencyKey,
    });
  }

  async get(jobId: string) {
    const job = await this.prisma.extensionLifecycleJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Extension lifecycle job not found');
    return job;
  }

  async execute(jobId: string, attempt: number) {
    const job = await this.prisma.extensionLifecycleJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Extension lifecycle job not found');
    if (job.status === 'SUCCEEDED') return job.result;
    const staleBefore = new Date(Date.now() - this.runningTimeoutMs());
    const claimed = await this.prisma.extensionLifecycleJob.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: { in: ['QUEUED', 'FAILED'] } },
          { status: 'RUNNING', attempts: { lt: attempt } },
          { status: 'RUNNING', startedAt: { lte: staleBefore } },
        ],
      },
      data: {
        status: 'RUNNING',
        attempts: attempt,
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) throw new ConflictException('Lifecycle job is already running');
    const actor: Actor = {
      userId: job.actorId || undefined,
      role: job.actorRole,
      name: job.actorName || undefined,
      email: job.actorEmail || undefined,
    };
    const payload = (job.payload as Record<string, any> | null) || {};
    const resource = job.command === 'PURGE_EXTENSION'
      ? `extension:${job.extensionId}`
      : `school:${job.schoolId}:extension:${job.extensionId}`;
    try {
      const result = await this.locks.run(resource, async () => {
        switch (job.command as ExtensionLifecycleCommand) {
          case 'INSTALL':
            return this.installations.install(job.installationId!, payload.versionId, actor);
          case 'UPGRADE':
            return this.installations.upgrade(job.installationId!, payload.versionId, actor, payload.acknowledgePermissions === true);
          case 'ROLLBACK':
            return this.installations.rollback(job.installationId!, actor, payload.targetVersionId);
          case 'ACTIVATE':
            return this.installations.activate(job.installationId!, true, actor);
          case 'DEACTIVATE':
            return this.installations.activate(job.installationId!, false, actor);
          case 'UNINSTALL':
            return this.installations.uninstall(job.installationId!, actor);
          case 'PURGE_INSTALLATION':
            return this.installations.removeUninstalled(job.installationId!, actor);
          case 'PURGE_EXTENSION':
            return this.extensions.deleteExtension(job.extensionId, actor, payload.reason);
        }
      });
      await this.prisma.extensionLifecycleJob.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', result: result as Prisma.InputJsonValue, completedAt: new Date() },
      });
      return result;
    } catch (error: any) {
      if (error instanceof NotFoundException && ['PURGE_INSTALLATION', 'PURGE_EXTENSION'].includes(job.command)) {
        const result = { purged: true, alreadyAbsent: true };
        await this.prisma.extensionLifecycleJob.update({
          where: { id: job.id },
          data: { status: 'SUCCEEDED', result, completedAt: new Date() },
        });
        return result;
      }
      await this.prisma.extensionLifecycleJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorCode: error?.constructor?.name || 'Error',
          errorMessage: String(error?.message || error).slice(0, 2000),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async submit(input: {
    schoolId: string;
    extensionId: string;
    installationId: string | null;
    command: ExtensionLifecycleCommand;
    payload: Record<string, unknown>;
    actor: Actor;
    idempotencyKey: string;
  }) {
    const payload = input.payload as Prisma.InputJsonValue;
    const existing = await this.prisma.extensionLifecycleJob.findUnique({
      where: { schoolId_idempotencyKey: { schoolId: input.schoolId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.command !== input.command || JSON.stringify(existing.payload || {}) !== JSON.stringify(input.payload))
        throw new ConflictException('Lifecycle idempotency key was already used for another command');
      return existing;
    }
    const job = await this.prisma.extensionLifecycleJob.create({
      data: {
        schoolId: input.schoolId,
        extensionId: input.extensionId,
        installationId: input.installationId,
        command: input.command,
        idempotencyKey: input.idempotencyKey,
        payload,
        actorId: input.actor.userId,
        actorRole: input.actor.role || 'PLATFORM_ADMIN',
        actorName: input.actor.name,
        actorEmail: input.actor.email,
      },
    });
    try {
      await this.queues.enqueue('extensions', {
        type: 'extension.lifecycle.execute',
        tenant: { mode: getTenantStore().mode === 'unscoped' ? 'PLATFORM' : 'SCOPED', schoolId: input.schoolId },
        actor: { id: input.actor.userId, role: input.actor.role || 'PLATFORM_ADMIN', name: input.actor.name },
        idempotencyKey: `extension-lifecycle:${job.id}`,
        payload: { jobId: job.id },
      });
    } catch (error) {
      await this.prisma.extensionLifecycleJob.delete({ where: { id: job.id } }).catch(() => undefined);
      throw error;
    }
    return job;
  }

  private runningTimeoutMs() {
    const parsed = Number.parseInt(process.env.EXTENSION_LIFECYCLE_STALE_MS || '', 10);
    return Number.isInteger(parsed) && parsed >= 30_000 && parsed <= 3_600_000 ? parsed : 300_000;
  }
}
