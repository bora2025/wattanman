import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { AuditService } from '../audit/audit.service';

/**
 * Backup / restore service — scoped to the current school only.
 *
 * Rewritten for multi-tenancy (conversion plan Phase 3a). Before this, both
 * `exportAll()` and `restore()` operated on the ENTIRE database with zero
 * filtering — safe when there was exactly one school, but once other schools'
 * data lives in the same tables, that was a live cross-tenant exfiltration
 * (export) and wipe (restore's TRUNCATE) vector for any single school's ADMIN.
 * This version is scoped by construction, not by convention: every read/write
 * below goes through the SAME PrismaService whose query middleware
 * auto-injects `schoolId` (see backend/src/database/prisma.service.ts) — there
 * is no separate "scoped" code path to accidentally bypass.
 *
 * Deliberately NOT covered here: a true whole-database export/restore for
 * disaster recovery. That capability existed before this rewrite (as an
 * unscoped ADMIN-only endpoint) and doesn't exist again until Phase 6 adds a
 * PLATFORM_ADMIN-only, explicitly `mode:'unscoped'` equivalent under
 * `/platform/backup/*`. Until then, disaster recovery relies on the hosting
 * provider's own database-level backups (e.g. Railway's automatic Postgres
 * backups) — this is a deliberate, temporary capability trade against closing
 * the security hole immediately, not an oversight.
 *
 * The shape of an export file is unchanged:
 *   { "version": 1, "exportedAt": "<ISO date>", "models": [...], "data": { "User": [...], ... } }
 * — except `models`/`data` now only cover tenant-scoped models, minus a small
 * exclusion list of live session/security artifacts that don't belong in a
 * downloadable file at all (see BACKUP_EXCLUDED_MODELS).
 */

/** Live session/security artifacts — never worth exporting or restoring, even
 * scoped to one school. A backup is meant to preserve *data*, not active
 * sessions or in-flight password-reset links. */
const BACKUP_MODEL_NAMES = [
  'User', 'AuditCleanupSchedule', 'SiteSetting', 'Post', 'ExtensionVisibilityGrant',
  'ExtensionInstallation', 'ExtensionPaymentEvidence', 'ExtensionPilotFeedback', 'ExtensionRecord',
] as const;
const RESTORE_DELETE_ORDER = [
  'ExtensionRecord', 'ExtensionPilotFeedback', 'ExtensionPaymentEvidence', 'ExtensionInstallation',
  'ExtensionVisibilityGrant', 'Post', 'SiteSetting', 'AuditCleanupSchedule', 'PasswordResetToken',
  'RefreshToken',
] as const;
const RESTORE_INSERT_ORDER = BACKUP_MODEL_NAMES.filter((model) => model !== 'User');
const BACKUP_MODEL_SET = new Set<string>(BACKUP_MODEL_NAMES);

for (const model of BACKUP_MODEL_NAMES) {
  if (!TENANT_SCOPED_MODELS.has(model)) throw new Error(`Backup model ${model} is not tenant scoped`);
}

@Injectable()
export class BackupService {
  constructor(
    private prisma: PrismaService,
    private queues: QueueInfrastructureService,
    private storage: R2StorageService,
    private audit: AuditService,
  ) {}

  async requestExport(actor: { userId?: string; role?: string; name?: string; email?: string }, requestKey: string) {
    const schoolId = getCurrentSchoolId();
    const normalizedKey = requestKey?.trim();
    if (!normalizedKey || normalizedKey.length > 200) throw new BadRequestException('A valid Idempotency-Key header is required');
    const record = await this.prisma.backupExport.upsert({
      where: { schoolId_requestKey: { schoolId, requestKey: normalizedKey } },
      create: { schoolId, requestKey: normalizedKey, requestedBy: actor.userId, requestedRole: actor.role },
      update: {},
    });
    if (record.status === 'FAILED') {
      await this.prisma.backupExport.update({ where: { id: record.id }, data: { status: 'PENDING', errorMessage: null } });
    }
    if (['PENDING', 'FAILED'].includes(record.status)) {
      await this.queues.enqueue('operations', {
        type: 'backup.export',
        tenant: { mode: 'SCOPED', schoolId },
        actor: { id: actor.userId, role: actor.role || 'ADMIN', name: actor.name },
        idempotencyKey: `backup-export:${record.id}`,
        payload: { exportId: record.id },
      });
    }
    await this.audit.log({ actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'BACKUP_REQUESTED', resource: 'BACKUP_EXPORT', resourceId: record.id });
    return this.getExport(record.id);
  }

  listExports() {
    return this.prisma.backupExport.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getExport(id: string) {
    const record = await this.prisma.backupExport.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Backup export not found');
    return record;
  }

  async downloadExport(id: string, actor: { userId?: string; role?: string; name?: string; email?: string }) {
    const record = await this.getExport(id);
    if (record.status !== 'AVAILABLE' || !record.storageKey || !record.checksum) throw new ConflictException('Backup export is not available');
    if (record.expiresAt && record.expiresAt <= new Date()) throw new ConflictException('Backup export has expired');
    await this.audit.log({ actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'BACKUP_DOWNLOAD', resource: 'BACKUP_EXPORT', resourceId: id, metadata: { checksum: record.checksum } });
    return { checksum: record.checksum, byteSize: record.byteSize, download: this.storage.presignPrivateDownload(record.storageKey, 300) };
  }

  async executeExport(id: string, attempt: number) {
    const current = await this.getExport(id);
    if (current.status === 'AVAILABLE') return current;
    await this.prisma.backupExport.update({ where: { id }, data: { status: 'RUNNING', attempts: attempt, startedAt: current.startedAt || new Date(), errorMessage: null } });
    try {
      const snapshot = await this.exportAll();
      const body = Buffer.from(JSON.stringify(snapshot));
      const checksum = createHash('sha256').update(body).digest('hex');
      const storageKey = `backups/schools/${current.schoolId}/${checksum}/${id}.json`;
      await this.storage.putPrivateImmutable(storageKey, body, 'application/json', checksum);
      const rowCount = Object.values(snapshot.data).reduce((sum, rows) => sum + rows.length, 0);
      const completedAt = new Date();
      const record = await this.prisma.backupExport.update({
        where: { id },
        data: { status: 'AVAILABLE', storageKey, checksum, byteSize: body.length, modelCount: snapshot.models.length, rowCount, completedAt, expiresAt: new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000) },
      });
      await this.audit.log({ actorId: current.requestedBy, actorRole: current.requestedRole, action: 'BACKUP_COMPLETED', resource: 'BACKUP_EXPORT', resourceId: id, metadata: { checksum, byteSize: body.length, rowCount } });
      return record;
    } catch (error: any) {
      await this.prisma.backupExport.update({ where: { id }, data: { status: 'FAILED', attempts: attempt, errorMessage: String(error?.message || error).slice(0, 1000) } });
      throw error;
    }
  }

  async requestRestore(exportId: string, actor: { userId?: string; role?: string; name?: string; email?: string }, requestKey: string) {
    const schoolId = getCurrentSchoolId();
    const normalizedKey = requestKey?.trim();
    if (!normalizedKey || normalizedKey.length > 200) throw new BadRequestException('A valid Idempotency-Key header is required');
    const source = await this.prisma.backupExport.findFirst({ where: { id: exportId, schoolId, status: 'AVAILABLE' } });
    if (!source?.storageKey || !source.checksum) throw new NotFoundException('Available backup export not found');
    const request = await this.prisma.backupRestoreRequest.upsert({
      where: { schoolId_requestKey: { schoolId, requestKey: normalizedKey } },
      create: { schoolId, exportId, requestKey: normalizedKey, requestedBy: actor.userId, requestedRole: actor.role },
      update: {},
    });
    if (request.exportId !== exportId) throw new ConflictException('Idempotency key is already used for another export');
    if (request.status === 'PENDING_VERIFICATION') {
      await this.queues.enqueue('operations', {
        type: 'backup.restore.verify',
        tenant: { mode: 'SCOPED', schoolId },
        actor: { id: actor.userId, role: actor.role || 'ADMIN', name: actor.name },
        idempotencyKey: `backup-restore-verify:${request.id}`,
        payload: { restoreId: request.id },
      });
    }
    await this.audit.log({ actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'RESTORE_REQUESTED', resource: 'BACKUP_RESTORE', resourceId: request.id, metadata: { exportId } });
    return this.getRestore(request.id);
  }

  listRestores() { return this.prisma.backupRestoreRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }

  async getRestore(id: string) {
    const request = await this.prisma.backupRestoreRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Restore request not found');
    return request;
  }

  async verifyRestore(id: string, attempt: number) {
    const request = await this.getRestore(id);
    if (['VERIFIED', 'APPROVED', 'EXECUTING', 'COMPLETED'].includes(request.status)) return request;
    await this.prisma.backupRestoreRequest.update({ where: { id }, data: { status: 'VERIFYING', attempts: attempt, errorMessage: null } });
    try {
      const source = await this.prisma.backupExport.findFirst({ where: { id: request.exportId, schoolId: request.schoolId, status: 'AVAILABLE' } });
      if (!source?.storageKey || !source.checksum) throw new Error('Source export is unavailable');
      const body = await this.storage.getPrivate(source.storageKey);
      if (body.length > 200 * 1024 * 1024) throw new Error('Backup exceeds the 200 MB verification limit');
      const checksum = createHash('sha256').update(body).digest('hex');
      if (checksum !== source.checksum) throw new Error('Backup checksum does not match immutable export metadata');
      const payload = JSON.parse(body.toString('utf8'));
      const report = this.verifySnapshot(payload, request.schoolId, checksum, body.length);
      const verified = await this.prisma.backupRestoreRequest.update({ where: { id }, data: { status: 'VERIFIED', verificationReport: report as any, verifiedAt: new Date(), errorMessage: null } });
      await this.audit.log({ actorId: request.requestedBy, actorRole: request.requestedRole, action: 'RESTORE_VERIFIED', resource: 'BACKUP_RESTORE', resourceId: id, metadata: report });
      return verified;
    } catch (error: any) {
      await this.prisma.backupRestoreRequest.update({ where: { id }, data: { status: 'REJECTED', errorMessage: String(error?.message || error).slice(0, 1000) } });
      throw error;
    }
  }

  async approveRestore(id: string, reason: string, actor: { userId?: string; role?: string; name?: string; email?: string }) {
    if (actor.role !== 'PLATFORM_ADMIN') throw new ConflictException('Platform administrator approval is required');
    if (!actor.userId) throw new BadRequestException('Approver identity is required');
    if (!reason?.trim() || reason.trim().length < 10 || reason.length > 500) throw new BadRequestException('Approval reason must be 10 to 500 characters');
    const request = await this.getRestore(id);
    if (request.status !== 'VERIFIED') throw new ConflictException('Only verified restore requests can be approved');
    if (request.requestedBy === actor.userId) throw new ConflictException('Restore requester cannot approve the same restore');
    const approved = await this.prisma.backupRestoreRequest.updateMany({
      where: { id, status: 'VERIFIED' },
      data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date(), approvalReason: reason.trim() },
    });
    if (approved.count !== 1) throw new ConflictException('Restore request changed before approval');
    await this.auditForSchool(request.schoolId, { actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'RESTORE_APPROVED', resource: 'BACKUP_RESTORE', resourceId: id, metadata: { reason: reason.trim() } });
    return this.getRestore(id);
  }

  async submitRestoreExecution(id: string, input: { confirmSchoolId?: string; changeTicket?: string }, actor: { userId?: string; role?: string; name?: string; email?: string }) {
    if (actor.role !== 'PLATFORM_ADMIN' || !actor.userId) throw new ConflictException('Platform administrator execution is required');
    const request = await this.getRestore(id);
    if (request.status !== 'APPROVED') throw new ConflictException('Only approved restore requests can execute');
    if (input?.confirmSchoolId !== request.schoolId) throw new BadRequestException('School confirmation does not match restore target');
    if (!input?.changeTicket?.trim() || input.changeTicket.trim().length < 10 || input.changeTicket.length > 200) throw new BadRequestException('Change ticket must be 10 to 200 characters');
    if ([request.requestedBy, request.approvedBy].includes(actor.userId)) throw new ConflictException('Restore executor must be independent from requester and approver');
    const transition = await this.prisma.backupRestoreRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'EXECUTING', errorMessage: null } });
    if (transition.count !== 1) throw new ConflictException('Restore request changed before execution');
    await this.queues.enqueue('operations', {
      type: 'backup.restore.execute', tenant: { mode: 'SCOPED', schoolId: request.schoolId },
      actor: { id: actor.userId, role: actor.role, name: actor.name }, idempotencyKey: `backup-restore-execute:${id}`,
      payload: { restoreId: id, changeTicket: input.changeTicket.trim() },
    });
    await this.auditForSchool(request.schoolId, { actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'RESTORE_EXECUTION_QUEUED', resource: 'BACKUP_RESTORE', resourceId: id, metadata: { changeTicket: input.changeTicket.trim() } });
    return this.getRestore(id);
  }

  async executeRestore(id: string, attempt: number, changeTicket: string) {
    const request = await this.getRestore(id);
    if (request.status === 'COMPLETED') return request;
    if (request.status !== 'EXECUTING' || !request.approvedBy || !request.verifiedAt) throw new ConflictException('Restore execution is not authorized');
    try {
      const source = await this.prisma.backupExport.findFirst({ where: { id: request.exportId, schoolId: request.schoolId, status: 'AVAILABLE' } });
      if (!source?.storageKey || !source.checksum) throw new Error('Source export is unavailable');
      const body = await this.storage.getPrivate(source.storageKey);
      const checksum = createHash('sha256').update(body).digest('hex');
      if (checksum !== source.checksum) throw new Error('Source export checksum changed after approval');
      const payload = JSON.parse(body.toString('utf8'));
      this.verifySnapshot(payload, request.schoolId, checksum, body.length);
      this.verifyRestoreReferences(payload);
      await this.verifyCatalogReferences(payload);
      const safetyExport = await this.persistSafetyExport(request, attempt);

      const result = await this.prisma.$transaction(async (transaction) => {
        for (const model of RESTORE_DELETE_ORDER) {
          const delegate = (transaction as any)[this.camel(model)];
          if (delegate?.deleteMany) await delegate.deleteMany({});
        }
        let inserted = 0;
        for (const row of payload.data.User || []) {
          const data = { ...this.parseDates('User', row), schoolId: request.schoolId };
          const { id: userId, createdAt: _createdAt, ...mutable } = data;
          await (transaction as any).user.upsert({ where: { id: userId }, create: data, update: mutable });
          inserted += 1;
        }
        for (const model of RESTORE_INSERT_ORDER) {
          const rows = payload.data[model] || [];
          if (!rows.length) continue;
          const delegate = (transaction as any)[this.camel(model)];
          const parsed = rows.map((row: any) => ({ ...this.parseDates(model, row), schoolId: request.schoolId }));
          for (let offset = 0; offset < parsed.length; offset += 250) {
            const chunk = parsed.slice(offset, offset + 250);
            const created = await delegate.createMany({ data: chunk });
            inserted += created.count;
          }
        }
        await (transaction as any).backupRestoreRequest.update({ where: { id }, data: { status: 'COMPLETED', attempts: attempt, executedAt: new Date(), errorMessage: null } });
        return { inserted };
      }, { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 });
      await this.auditForSchool(request.schoolId, { action: 'RESTORE_COMPLETED', resource: 'BACKUP_RESTORE', resourceId: id, metadata: { changeTicket, safetyExportId: safetyExport.id, inserted: result.inserted, sourceChecksum: checksum } });
      return this.getRestore(id);
    } catch (error: any) {
      await this.prisma.backupRestoreRequest.updateMany({ where: { id, status: 'EXECUTING' }, data: { status: 'FAILED', attempts: attempt, errorMessage: String(error?.message || error).slice(0, 1000) } }).catch(() => undefined);
      await this.auditForSchool(request.schoolId, { action: 'RESTORE_FAILED', resource: 'BACKUP_RESTORE', resourceId: id, success: false, errorMessage: String(error?.message || error).slice(0, 1000), metadata: { changeTicket } });
      throw error;
    }
  }

  async createLegalHold(input: { schoolId?: string; category?: string; resourceId?: string; caseReference?: string; reason?: string }, actor: { userId?: string; role?: string; name?: string; email?: string }) {
    if (actor.role !== 'PLATFORM_ADMIN' || !actor.userId) throw new ConflictException('Platform administrator is required');
    const schoolId = input?.schoolId?.trim();
    const category = input?.category?.trim().toUpperCase();
    const allowed = ['AUDIT_LOG', 'BACKUP_EXPORT', 'RESTORE_HISTORY', 'TELEMETRY', 'METRICS', 'PAYMENT_EVIDENCE', 'EXTENSION_RECORD'];
    if (!schoolId || !(await this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) throw new NotFoundException('School not found');
    if (!category || !allowed.includes(category)) throw new BadRequestException(`category must be one of: ${allowed.join(', ')}`);
    if (!input.caseReference?.trim() || input.caseReference.trim().length < 3 || input.caseReference.length > 100) throw new BadRequestException('caseReference must be 3 to 100 characters');
    if (!input.reason?.trim() || input.reason.trim().length < 10 || input.reason.length > 500) throw new BadRequestException('reason must be 10 to 500 characters');
    const resourceId = input.resourceId?.trim() || '';
    const hold = await this.prisma.dataLegalHold.upsert({
      where: { schoolId_category_resourceId: { schoolId, category, resourceId } },
      create: { schoolId, category, resourceId, caseReference: input.caseReference.trim(), reason: input.reason.trim(), createdBy: actor.userId },
      update: { active: true, caseReference: input.caseReference.trim(), reason: input.reason.trim(), createdBy: actor.userId, createdAt: new Date(), releasedBy: null, releasedAt: null, releaseReason: null },
    });
    await this.auditForSchool(schoolId, { actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'LEGAL_HOLD_CREATED', resource: 'DATA_LEGAL_HOLD', resourceId: hold.id, metadata: { category, resourceId, caseReference: hold.caseReference } });
    return hold;
  }

  listLegalHolds(input: { schoolId?: string; active?: string }) {
    return this.prisma.dataLegalHold.findMany({ where: { ...(input.schoolId ? { schoolId: input.schoolId } : {}), ...(input.active === 'true' ? { active: true } : input.active === 'false' ? { active: false } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async releaseLegalHold(id: string, reason: string, actor: { userId?: string; role?: string; name?: string; email?: string }) {
    if (actor.role !== 'PLATFORM_ADMIN' || !actor.userId) throw new ConflictException('Platform administrator is required');
    if (!reason?.trim() || reason.trim().length < 10 || reason.length > 500) throw new BadRequestException('release reason must be 10 to 500 characters');
    const hold = await this.prisma.dataLegalHold.findUnique({ where: { id } });
    if (!hold || !hold.active) throw new NotFoundException('Active legal hold not found');
    const released = await this.prisma.dataLegalHold.update({ where: { id }, data: { active: false, releasedBy: actor.userId, releasedAt: new Date(), releaseReason: reason.trim() } });
    await this.auditForSchool(hold.schoolId, { actorId: actor.userId, actorRole: actor.role, actorName: actor.name, actorEmail: actor.email, action: 'LEGAL_HOLD_RELEASED', resource: 'DATA_LEGAL_HOLD', resourceId: id, metadata: { category: hold.category, resourceId: hold.resourceId, reason: reason.trim() } });
    return released;
  }

  async runRetention(now = new Date()) {
    const expiredExports = await this.prisma.backupExport.findMany({ where: { status: 'AVAILABLE', expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' }, take: 100 });
    let exportsExpired = 0;
    for (const item of expiredExports) {
      if (await this.hasLegalHold(item.schoolId, 'BACKUP_EXPORT', item.id)) continue;
      if (item.storageKey) await this.storage.deletePrivate(item.storageKey);
      const updated = await this.prisma.backupExport.updateMany({ where: { id: item.id, status: 'AVAILABLE', storageKey: item.storageKey }, data: { status: 'EXPIRED', storageKey: null } });
      exportsExpired += updated.count;
    }
    const terminalCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const restoreHeldSchools = await this.heldSchools('RESTORE_HISTORY');
    const telemetryHeldSchools = await this.heldSchools('TELEMETRY');
    const metricHeldSchools = await this.heldSchools('METRICS');
    const restores = await this.prisma.backupRestoreRequest.deleteMany({ where: { status: { in: ['COMPLETED', 'FAILED', 'REJECTED'] }, updatedAt: { lt: terminalCutoff }, schoolId: { notIn: restoreHeldSchools } } });
    const apiMetrics = await this.prisma.extensionApiMetric.deleteMany({ where: { bucket: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }, ...(telemetryHeldSchools.length ? { OR: [{ schoolId: null }, { schoolId: { notIn: telemetryHeldSchools } }] } : {}) } });
    const dailyMetrics = await this.prisma.schoolDailyMetric.deleteMany({ where: { date: { lt: new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000) }, schoolId: { notIn: metricHeldSchools } } });
    return { exportsExpired, restoreRequestsDeleted: restores.count, apiMetricsDeleted: apiMetrics.count, schoolMetricsDeleted: dailyMetrics.count, completedAt: now.toISOString() };
  }

  private hasLegalHold(schoolId: string, category: string, resourceId: string) {
    return this.prisma.dataLegalHold.findFirst({ where: { schoolId, category, active: true, resourceId: { in: ['', resourceId] } } }).then(Boolean);
  }

  private async heldSchools(category: string) {
    const rows = await this.prisma.dataLegalHold.findMany({ where: { category, active: true, resourceId: '' }, select: { schoolId: true }, distinct: ['schoolId'] });
    return rows.map((row) => row.schoolId);
  }

  private async persistSafetyExport(request: any, attempt: number) {
    const snapshot = await this.exportAll();
    const body = Buffer.from(JSON.stringify(snapshot));
    const checksum = createHash('sha256').update(body).digest('hex');
    const id = `safety-${request.id}`;
    const storageKey = `backups/schools/${request.schoolId}/${checksum}/${id}.json`;
    await this.storage.putPrivateImmutable(storageKey, body, 'application/json', checksum);
    return this.prisma.backupExport.upsert({
      where: { schoolId_requestKey: { schoolId: request.schoolId, requestKey: `pre-restore:${request.id}` } },
      create: { schoolId: request.schoolId, requestKey: `pre-restore:${request.id}`, status: 'AVAILABLE', storageKey, checksum, byteSize: body.length, modelCount: snapshot.models.length, rowCount: Object.values(snapshot.data).reduce((sum, rows) => sum + rows.length, 0), requestedRole: 'SYSTEM', attempts: attempt, completedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      update: {},
    });
  }

  private verifyRestoreReferences(payload: any) {
    const installations = new Set((payload.data.ExtensionInstallation || []).map((row: any) => row.id));
    for (const model of ['ExtensionPaymentEvidence', 'ExtensionPilotFeedback', 'ExtensionRecord']) {
      for (const row of payload.data[model] || []) {
        if (!installations.has(row.installationId)) throw new Error(`${model} references an installation absent from the snapshot`);
      }
    }
    const users = payload.data.User || [];
    if (!users.some((row: any) => ['ADMIN', 'SUPER_ADMIN'].includes(row.role))) throw new Error('Restore snapshot must retain at least one school administrator');
  }

  private async verifyCatalogReferences(payload: any) {
    const extensionIds = new Set<string>();
    const versionIds = new Set<string>();
    for (const row of payload.data.ExtensionInstallation || []) {
      extensionIds.add(row.extensionId);
      versionIds.add(row.installedVersionId);
      if (row.availableVersionId) versionIds.add(row.availableVersionId);
    }
    for (const row of payload.data.ExtensionVisibilityGrant || []) extensionIds.add(row.extensionId);
    for (const row of payload.data.ExtensionRecord || []) {
      extensionIds.add(row.extensionId);
      versionIds.add(row.versionId);
    }
    const [extensions, versions] = await Promise.all([
      this.prisma.extension.count({ where: { id: { in: [...extensionIds] } } }),
      this.prisma.extensionVersion.count({ where: { id: { in: [...versionIds] } } }),
    ]);
    if (extensions !== extensionIds.size) throw new Error('Restore snapshot references unavailable extensions');
    if (versions !== versionIds.size) throw new Error('Restore snapshot references unavailable extension versions');
  }

  private parseDates(modelName: string, row: any) {
    const model = (Prisma.dmmf?.datamodel?.models ?? []).find((candidate: any) => candidate.name === modelName) as any;
    const output = { ...row };
    for (const field of model?.fields || []) {
      if (field.kind === 'scalar' && field.type === 'DateTime' && typeof output[field.name] === 'string') {
        const date = new Date(output[field.name]);
        if (Number.isNaN(date.getTime())) throw new Error(`${modelName}.${field.name} contains an invalid date`);
        output[field.name] = date;
      }
    }
    return output;
  }

  private verifySnapshot(payload: any, schoolId: string, checksum: string, byteSize: number) {
    if (!payload || payload.version !== 2 || !payload.data || typeof payload.data !== 'object') throw new Error('Unsupported or invalid backup format');
    const declared = Array.isArray(payload.models) ? payload.models : [];
    const unknownModels = Object.keys(payload.data).filter((name) => !BACKUP_MODEL_SET.has(name));
    if (unknownModels.length) throw new Error(`Backup contains unsupported models: ${unknownModels.join(', ')}`);
    let rowCount = 0;
    const perModel: Record<string, number> = {};
    for (const name of declared) {
      if (!BACKUP_MODEL_SET.has(name)) throw new Error(`Backup declares unsupported model: ${name}`);
      const rows = payload.data[name];
      if (!Array.isArray(rows)) throw new Error(`Backup model ${name} is not an array`);
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Backup model ${name} contains an invalid row`);
        if ('schoolId' in row && row.schoolId !== schoolId) throw new Error(`Backup model ${name} contains foreign tenant data`);
      }
      perModel[name] = rows.length;
      rowCount += rows.length;
      if (rowCount > 1_000_000) throw new Error('Backup exceeds the one million row verification limit');
    }
    return { schemaVersion: 1, snapshotVersion: 2, checksum, byteSize, modelCount: declared.length, rowCount, perModel, verifiedSchoolId: schoolId, isolation: 'READ_ONLY_WORKER', verifiedAt: new Date().toISOString() };
  }

  private async auditForSchool(schoolId: string, entry: Parameters<AuditService['log']>[0]) {
    const { tenantContext } = await import('../tenancy/tenant-context');
    return tenantContext.run({ schoolId, mode: 'scoped' }, () => this.audit.log(entry));
  }

  private camel(modelName: string): string {
    return modelName.charAt(0).toLowerCase() + modelName.slice(1);
  }

  /** Export every tenant-scoped model's rows for the CURRENT school. Scoping
   * is implicit — `findMany()` is called with no `where` at all, and
   * PrismaService's middleware merges `schoolId` in automatically, exactly
   * like any other call site in the codebase. */
  async exportAll() {
    const data: Record<string, any[]> = {};
    for (const name of BACKUP_MODEL_NAMES) {
      const delegate = (this.prisma as any)[this.camel(name)];
      if (delegate?.findMany) {
        data[name] = await delegate.findMany();
      }
    }
    return {
      version: 2, // bumped: v1 files were whole-database dumps, not school-scoped — see importFromV1Warning below
      exportedAt: new Date().toISOString(),
      models: [...BACKUP_MODEL_NAMES],
      data,
    };
  }

}
