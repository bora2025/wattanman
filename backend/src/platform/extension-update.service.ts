import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { ExtensionLifecycleJobsService } from './extension-lifecycle-jobs.service';
import { ScheduledTaskGuardService } from '../security/scheduled-task-guard.service';
import { createHash } from 'crypto';

@Injectable()
export class ExtensionUpdateService {
  private readonly logger = new Logger(ExtensionUpdateService.name);

  constructor(private prisma: PrismaService, private lifecycleJobs: ExtensionLifecycleJobsService, private schedules: ScheduledTaskGuardService) {}

  @Cron('0 */6 * * *')
  async run() {
    if (process.env.WORKER_ROLE && process.env.WORKER_ROLE !== 'extension') return;
    if (!(await this.schedules.acquire('extension-updates', 6 * 60 * 60_000))) return;
    const candidates = await this.prisma.extensionInstallation.findMany({
      where: { installedAt: { not: null }, uninstalledAt: null, extension: { status: 'ACTIVE' } },
      include: {
        installedVersion: true,
        extension: { include: { versions: { where: { lifecycleStatus: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } } },
      },
    });
    const evaluatedTargets = new Map<string, boolean>();
    let upgraded = 0;
    let notified = 0;
    for (const installation of candidates) {
      const target = installation.extension.versions[0];
      if (!target || target.id === installation.installedVersionId) continue;
      if (!evaluatedTargets.has(target.id)) evaluatedTargets.set(target.id, await this.targetAvailable(target));
      if (!evaluatedTargets.get(target.id) || !this.inRollout(installation, target)) continue;
      const currentPermissions = ((installation.installedVersion.manifest as Record<string, any>)?.permissions || []) as string[];
      const targetPermissions = ((target.manifest as Record<string, any>)?.permissions || []) as string[];
      const addedPermissions = targetPermissions.filter((permission) => !currentPermissions.includes(permission));
      if (installation.updatePolicy === 'AUTOMATIC' && !addedPermissions.length) {
        try {
          await this.lifecycleJobs.submitInstallation(
            installation.id,
            'UPGRADE',
            { versionId: target.id, acknowledgePermissions: false },
            { role: 'SYSTEM', name: 'Extension update scheduler' },
            `automatic-upgrade:${installation.id}:${target.id}`,
          );
          upgraded += 1;
          continue;
        } catch (error: any) {
          this.logger.warn(`Automatic extension update failed for ${installation.id}: ${error?.message || error}`);
        }
      }
      const newlyAvailable = installation.availableVersionId !== target.id;
      await this.prisma.extensionInstallation.update({
        where: { id: installation.id },
        data: { availableVersionId: target.id, updateNotifiedAt: newlyAvailable && installation.updatePolicy !== 'MANUAL' ? new Date() : installation.updateNotifiedAt },
      });
      if (newlyAvailable && installation.updatePolicy !== 'MANUAL') {
        notified += 1;
      }
    }
    this.logger.log(`Extension updates: ${upgraded} automatic upgrades, ${notified} school notifications.`);
    return { upgraded, notified };
  }

  private async targetAvailable(target: any) {
    if (target.rolloutPausedAt) return false;
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const failures = await this.prisma.extensionLifecycleJob.count({
      where: { extensionId: target.extensionId, command: 'UPGRADE', status: 'FAILED', updatedAt: { gte: since } },
    });
    const threshold = this.boundedEnv('EXTENSION_ROLLOUT_PAUSE_FAILURES', 5, 1, 1000);
    if (failures < threshold) return true;
    await this.prisma.extensionVersion.updateMany({
      where: { id: target.id, rolloutPausedAt: null },
      data: { rolloutPausedAt: new Date(), rolloutPauseReason: `${failures} upgrade failures within six hours` },
    });
    this.logger.error(`Paused extension rollout ${target.id} after ${failures} upgrade failures`);
    return false;
  }

  private inRollout(installation: any, target: any) {
    const stage = target.rolloutStage || 'INTERNAL';
    if (stage === 'INTERNAL') return installation.rolloutGroup === 'INTERNAL';
    if (stage === 'PILOT') return ['INTERNAL', 'PILOT'].includes(installation.rolloutGroup);
    if (stage === 'FULL') return true;
    const percent = stage === 'PERCENT_5' ? 5 : stage === 'PERCENT_25' ? 25 : 0;
    if (!percent) return false;
    if (['INTERNAL', 'PILOT'].includes(installation.rolloutGroup)) return true;
    const bucket = Number.parseInt(createHash('sha256').update(`${target.id}:${installation.schoolId}`).digest('hex').slice(0, 8), 16) % 100;
    return bucket < percent;
  }

  private boundedEnv(name: string, fallback: number, minimum: number, maximum: number) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
  }
}
