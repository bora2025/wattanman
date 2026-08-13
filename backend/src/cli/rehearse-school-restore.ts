import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BackupService } from '../backup/backup.service';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';
import { CircuitBreakerService } from '../security/circuit-breaker.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { tenantContext } from '../tenancy/tenant-context';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../tenancy/constants';
import { AuditService } from '../audit/audit.service';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    BackupService,
    CircuitBreakerService,
    R2StorageService,
    { provide: QueueInfrastructureService, useValue: { enqueue: async () => { throw new Error('Rehearsal must not enqueue background jobs'); } } },
    { provide: AuditService, useValue: { log: async () => undefined } },
  ],
})
class RestoreRehearsalModule {}

async function main() {
  if (process.env.CONFIRM_DISPOSABLE_RESTORE_REHEARSAL !== 'YES') throw new Error('Set CONFIRM_DISPOSABLE_RESTORE_REHEARSAL=YES');
  const app = await NestFactory.createApplicationContext(RestoreRehearsalModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const backups = app.get(BackupService);
  const storage = app.get(R2StorageService);
  const runId = `restore-rehearsal-${Date.now()}`;
  const startedAt = Date.now();
  let schoolId: string | undefined;
  const storageKeys = new Set<string>();
  let outcome = 'FAILED';
  let errorMessage: string | undefined;
  let report: Record<string, unknown> | undefined;
  try {
    const school = await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => prisma.school.create({
      data: { subdomain: runId, name: `Disposable ${runId}`, status: 'ACTIVE', storagePrefix: `schools/${runId}` },
    }));
    schoolId = school.id;
    const source = await tenantContext.run({ schoolId, mode: 'scoped' }, async () => {
      await prisma.user.create({ data: { schoolId, email: `${runId}@invalid.test`, password: 'DISPOSABLE-NOT-A-LOGIN', name: 'Recovery Rehearsal Admin', role: 'ADMIN' } });
      const post = await prisma.post.create({ data: { schoolId, title: 'BEFORE_RESTORE', body: runId, published: false } });
      const record = await prisma.backupExport.create({ data: { schoolId, requestKey: `${runId}:source`, status: 'PENDING', requestedRole: 'SYSTEM' } });
      const completed = await backups.executeExport(record.id, 1);
      if (completed.storageKey) storageKeys.add(completed.storageKey);
      await prisma.post.update({ where: { id: post.id }, data: { title: 'MUTATED_AFTER_EXPORT' } });
      return { exportId: record.id, postId: post.id };
    });
    const restore = await tenantContext.run({ schoolId, mode: 'scoped' }, async () => {
      const request = await prisma.backupRestoreRequest.create({ data: { schoolId: schoolId!, exportId: source.exportId, requestKey: `${runId}:restore`, requestedBy: `${runId}:requester`, requestedRole: 'ADMIN' } });
      return backups.verifyRestore(request.id, 1);
    });
    await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => backups.approveRestore(restore.id, `Quarterly automated rehearsal ${runId}`, { userId: `${runId}:approver`, role: 'PLATFORM_ADMIN' }));
    await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => prisma.backupRestoreRequest.update({ where: { id: restore.id }, data: { status: 'EXECUTING' } }));
    const executionStartedAt = Date.now();
    await tenantContext.run({ schoolId, mode: 'scoped' }, () => backups.executeRestore(restore.id, 1, `Quarterly rehearsal ${runId}`));
    const restored = await tenantContext.run({ schoolId, mode: 'scoped' }, () => prisma.post.findUnique({ where: { id: source.postId } }));
    if (restored?.title !== 'BEFORE_RESTORE' || restored.body !== runId) throw new Error('Restored marker does not match source export');
    const safety = await tenantContext.run({ schoolId, mode: 'scoped' }, () => prisma.backupExport.findUnique({ where: { schoolId_requestKey: { schoolId: schoolId!, requestKey: `pre-restore:${restore.id}` } } }));
    if (!safety?.storageKey) throw new Error('Pre-restore safety export is missing');
    storageKeys.add(safety.storageKey);
    outcome = 'PASSED';
    report = { runId, outcome, schoolId, sourceExportId: source.exportId, restoreId: restore.id, safetyExportId: safety.id, rpoSeconds: 0, restoreSeconds: Math.ceil((Date.now() - executionStartedAt) / 1000), totalSeconds: Math.ceil((Date.now() - startedAt) / 1000), completedAt: new Date().toISOString() };
  } catch (error: any) {
    errorMessage = String(error?.message || error).slice(0, 1000);
    throw error;
  } finally {
    if (schoolId) {
      const deleted = await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => prisma.school.deleteMany({ where: { id: schoolId } }));
      if (deleted.count !== 1) throw new Error('Disposable rehearsal school cleanup was not verified');
    }
    for (const key of storageKeys) {
      await storage.deletePrivate(key);
      try {
        await storage.getPrivate(key);
        throw new Error(`Rehearsal object still exists after cleanup: ${key}`);
      } catch (error: any) {
        if (!String(error?.message || error).includes('(404)')) throw error;
      }
    }
    const platform = await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => prisma.school.findUnique({ where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN } })).catch(() => null);
    if (platform) await tenantContext.run({ schoolId: platform.id, mode: 'scoped' }, () => prisma.auditLog.create({ data: { schoolId: platform.id, action: 'RESTORE_REHEARSAL', resource: 'BACKUP_RESTORE', resourceId: runId, actorRole: 'SYSTEM', success: outcome === 'PASSED', errorMessage, metadata: { outcome, durationSeconds: Math.ceil((Date.now() - startedAt) / 1000), disposableSchoolId: schoolId } } })).catch(() => undefined);
    await app.close();
  }
  if (report) process.stdout.write(`${JSON.stringify({ ...report, cleanupVerified: true })}\n`);
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
