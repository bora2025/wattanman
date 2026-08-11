import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { ScheduledTaskGuardService } from '../security/scheduled-task-guard.service';

@Injectable()
export class ExtensionCleanupService {
  private readonly logger = new Logger(ExtensionCleanupService.name);

  constructor(private prisma: PrismaService, private storage: R2StorageService, private schedules: ScheduledTaskGuardService) {}

  @Cron('15 3 * * *')
  async run() {
    if (process.env.WORKER_ROLE && process.env.WORKER_ROLE !== 'extension') return;
    if (!(await this.schedules.acquire('extension-cleanup', 24 * 60 * 60_000))) return;
    const now = new Date();
    const packageCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const expiredInstallations = await this.prisma.extensionInstallation.findMany({
      where: { enabled: false, purgeAfter: { lte: now } },
      select: { id: true, schoolId: true, extensionId: true },
    });
    if (expiredInstallations.length) {
      await this.prisma.$transaction(async (transaction) => {
        for (const installation of expiredInstallations) {
          await transaction.extensionRecord.deleteMany({
            where: { schoolId: installation.schoolId, extensionId: installation.extensionId },
          });
        }
        await transaction.extensionInstallation.deleteMany({
          where: { id: { in: expiredInstallations.map((installation) => installation.id) } },
        });
      });
    }

    const expiredPackages = await this.prisma.extensionVersion.findMany({
      where: {
        lifecycleStatus: { in: ['REJECTED', 'RETIRED'] },
        createdAt: { lte: packageCutoff },
        packageStorageKey: { not: null },
        installations: { none: {} },
      },
      select: { id: true, packageStorageKey: true },
    });
    let deletedPackages = 0;
    for (const version of expiredPackages) {
      try {
        await this.storage.deletePrivate(version.packageStorageKey as string);
        await this.prisma.extensionVersion.update({
          where: { id: version.id },
          data: { packageStorageKey: null },
        });
        deletedPackages += 1;
      } catch (error: any) {
        this.logger.warn(`Extension package cleanup failed for ${version.id}: ${error?.message || error}`);
      }
    }
    this.logger.log(`Extension cleanup: purged ${expiredInstallations.length} installations and ${deletedPackages} package objects.`);
    return { installations: expiredInstallations.length, packages: deletedPackages };
  }
}
