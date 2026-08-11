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
    const quarantineCutoff = new Date(now.getTime() - this.retentionDays('EXTENSION_QUARANTINE_RETENTION_DAYS', 7) * 24 * 60 * 60 * 1000);
    const rejectedCutoff = new Date(now.getTime() - this.retentionDays('EXTENSION_REJECTED_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000);
    const batchSize = this.batchSize();
    const expiredEvidence = await this.prisma.extensionPaymentEvidence.findMany({
      where: {
        status: { in: ['PENDING', 'SUBMITTED'] },
        legalHold: false,
        retainUntil: { lte: now },
        storageKey: { not: null },
      },
      select: { id: true, installationId: true, storageKey: true, status: true },
      orderBy: [{ retainUntil: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    let purgedEvidence = 0;
    for (const evidence of expiredEvidence) {
      try {
        const claimed = await this.prisma.extensionPaymentEvidence.updateMany({
          where: {
            id: evidence.id,
            storageKey: evidence.storageKey,
            status: evidence.status,
            legalHold: false,
            retainUntil: { lte: now },
          },
          data: { status: 'PURGING' },
        });
        if (claimed.count !== 1) continue;
        await this.storage.deletePrivate(evidence.storageKey as string);
        await this.prisma.$transaction(async (transaction) => {
          const finalized = await transaction.extensionPaymentEvidence.updateMany({
            where: {
              id: evidence.id,
              storageKey: evidence.storageKey,
              status: 'PURGING',
            },
            data: { storageKey: null, status: 'PURGED', purgedAt: now },
          });
          if (finalized.count !== 1) return;
          await transaction.extensionInstallation.updateMany({
            where: { id: evidence.installationId, invoiceStorageKey: evidence.storageKey },
            data: {
              invoiceStorageKey: null,
              invoiceFileName: null,
              invoiceContentType: null,
            },
          });
          purgedEvidence += 1;
        });
      } catch (error: any) {
        await this.prisma.extensionPaymentEvidence.updateMany({
          where: { id: evidence.id, storageKey: evidence.storageKey, status: 'PURGING' },
          data: { status: evidence.status },
        }).catch(() => undefined);
        this.logger.warn(`Payment evidence cleanup failed for ${evidence.id}: ${error?.message || error}`);
      }
    }
    const expiredInstallations = await this.prisma.extensionInstallation.findMany({
      where: {
        enabled: false,
        purgeAfter: { lte: now },
        paymentEvidence: { none: { storageKey: { not: null } } },
      },
      select: { id: true, schoolId: true, extensionId: true },
      take: batchSize,
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

    const abandonedPackages = await this.prisma.extensionVersion.findMany({
      where: {
        lifecycleStatus: { in: ['QUARANTINED', 'VALIDATING'] },
        updatedAt: { lte: quarantineCutoff },
        packageStorageKey: { not: null },
        installations: { none: {} },
      },
      select: { id: true, packageStorageKey: true, assets: { select: { storageKey: true } } },
      take: batchSize,
    });
    let expiredQuarantines = 0;
    for (const version of abandonedPackages) {
      await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.extensionVersion.updateMany({
          where: { id: version.id, lifecycleStatus: { in: ['QUARANTINED', 'VALIDATING'] }, updatedAt: { lte: quarantineCutoff } },
          data: { lifecycleStatus: 'REJECTED', reviewNotes: 'Package quarantine retention expired before validation completed.' },
        });
        if (claimed.count !== 1) return;
        await transaction.extensionValidation.updateMany({
          where: { extensionVersionId: version.id, status: { in: ['PENDING', 'RUNNING'] } },
          data: { status: 'FAILED', errors: [{ code: 'QUARANTINE_RETENTION_EXPIRED', message: 'Package validation did not complete within the quarantine retention period.' }], completedAt: now },
        });
        expiredQuarantines += 1;
      });
    }

    const expiredPackages = await this.prisma.extensionVersion.findMany({
      where: {
        lifecycleStatus: 'REJECTED',
        updatedAt: { lte: rejectedCutoff },
        packageStorageKey: { not: null },
        installations: { none: {} },
      },
      select: { id: true, packageStorageKey: true, assets: { select: { storageKey: true } } },
      take: batchSize,
    });
    let deletedPackages = 0;
    for (const version of expiredPackages) {
      try {
        const storageKeys = new Set([version.packageStorageKey as string, ...version.assets.map((asset) => asset.storageKey)]);
        for (const storageKey of storageKeys) await this.storage.deletePrivate(storageKey);
        await this.prisma.$transaction(async (transaction) => {
          await transaction.extensionAsset.deleteMany({ where: { extensionVersionId: version.id } });
          await transaction.extensionVersion.update({
            where: { id: version.id },
            data: { packageStorageKey: null },
          });
        });
        deletedPackages += 1;
      } catch (error: any) {
        this.logger.warn(`Extension package cleanup failed for ${version.id}: ${error?.message || error}`);
      }
    }
    this.logger.log(`Extension cleanup: purged ${purgedEvidence} payment evidence objects, ${expiredInstallations.length} installations, expired ${expiredQuarantines} quarantines, and purged ${deletedPackages} rejected package objects.`);
    return { evidence: purgedEvidence, installations: expiredInstallations.length, quarantines: expiredQuarantines, packages: deletedPackages };
  }

  private retentionDays(name: string, fallback: number) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : fallback;
  }

  private batchSize() {
    const parsed = Number.parseInt(process.env.EXTENSION_RETENTION_BATCH_SIZE || '', 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : 100;
  }
}
