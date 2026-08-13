import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPrivateKey, sign } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';
import { RailwayDomainService } from './railway-domain.service';

interface Actor { userId: string; role: string; name?: string }

@Injectable()
export class SchoolDeletionService {
  constructor(private prisma: PrismaService, private queues: QueueInfrastructureService, private storage: R2StorageService, private domains: RailwayDomainService) {}

  list() { return this.prisma.schoolDeletionRequest.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }); }

  async request(schoolId: string, reason: string, actor: Actor) {
    const normalizedReason = reason?.trim();
    if (!normalizedReason || normalizedReason.length < 10) throw new BadRequestException('A deletion reason of at least 10 characters is required');
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school || school.subdomain === 'platform') throw new NotFoundException('School not found');
    await this.assertNoLegalHold(schoolId);
    const existing = await this.prisma.schoolDeletionRequest.findFirst({ where: { deletedSchoolId: schoolId, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'EXECUTING'] } } });
    if (existing) return existing;
    await this.prisma.school.update({ where: { id: schoolId }, data: { status: 'DELETION_SCHEDULED' } });
    return this.prisma.schoolDeletionRequest.create({ data: { deletedSchoolId: schoolId, schoolName: school.name, schoolSubdomain: school.subdomain, reason: normalizedReason, requestedBy: actor.userId } });
  }

  async approve(id: string, reason: string, actor: Actor) {
    const request = await this.get(id);
    if (request.status !== 'PENDING_APPROVAL') throw new ConflictException('Deletion request is not pending approval');
    if (request.requestedBy === actor.userId) throw new ConflictException('Requester cannot approve the same school deletion');
    if (!reason?.trim()) throw new BadRequestException('Approval reason is required');
    await this.assertNoLegalHold(request.deletedSchoolId);
    return this.prisma.schoolDeletionRequest.update({ where: { id }, data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date(), approvalReason: reason.trim() } });
  }

  async execute(id: string, confirmSchoolId: string, changeTicket: string, actor: Actor) {
    const request = await this.get(id);
    if (request.status !== 'APPROVED') throw new ConflictException('Deletion request is not approved');
    if ([request.requestedBy, request.approvedBy].includes(actor.userId)) throw new ConflictException('Executor must differ from requester and approver');
    if (confirmSchoolId !== request.deletedSchoolId) throw new BadRequestException('School ID confirmation does not match');
    if (!changeTicket?.trim()) throw new BadRequestException('Change ticket is required');
    await this.prisma.schoolDeletionRequest.update({ where: { id }, data: { status: 'QUEUED', executedBy: actor.userId, changeTicket: changeTicket.trim(), errorMessage: null } });
    await this.queues.enqueue('school-deletions', { type: 'school.delete.execute', tenant: { mode: 'PLATFORM', schoolId: request.deletedSchoolId }, actor: { id: actor.userId, role: actor.role, name: actor.name }, idempotencyKey: `school-delete:${id}`, payload: { requestId: id } });
    return this.get(id);
  }

  async executeQueued(id: string, attempt: number) {
    const request = await this.get(id);
    if (request.status === 'COMPLETED') return request;
    if (!['QUEUED', 'EXECUTING', 'FAILED'].includes(request.status)) throw new ConflictException('Deletion request is not executable');
    await this.prisma.schoolDeletionRequest.update({ where: { id }, data: { status: 'EXECUTING', attempts: attempt, errorMessage: null } });
    try {
      this.signingKey();
      await this.assertNoLegalHold(request.deletedSchoolId);
      const prefixes = [`schools/${request.deletedSchoolId}/`, `backups/schools/${request.deletedSchoolId}/`, `reports/extensions/purge/${request.deletedSchoolId}/`];
      const keys = new Set<string>();
      for (const prefix of prefixes) for (const key of await this.storage.listPrivatePrefix(prefix)) keys.add(key);
      const dbSummary = request.dbSummary || await this.countTenantRows(request.deletedSchoolId);
      const priorDeleted = Number((request.storageSummary as any)?.deletedObjects || 0);
      const storageSummary = { deletedObjects: priorDeleted + keys.size, verifiedPrefixes: prefixes };
      await this.prisma.schoolDeletionRequest.update({ where: { id }, data: { dbSummary: dbSummary as Prisma.InputJsonValue, storageSummary: storageSummary as Prisma.InputJsonValue } });
      for (const key of keys) await this.storage.deletePrivate(key);
      for (const prefix of prefixes) if ((await this.storage.listPrivatePrefix(prefix)).length) throw new ServiceUnavailableException(`R2 purge verification failed for ${prefix}`);
      const deletion = await this.prisma.school.deleteMany({ where: { id: request.deletedSchoolId } });
      if (deletion.count > 1) throw new ConflictException('Unexpected school deletion count');
      const remainingRows = await this.countTenantRows(request.deletedSchoolId);
      if (Object.values(remainingRows).some((count) => count !== 0)) throw new ConflictException('Database purge verification failed');
      await this.domains.deregisterDomain(request.schoolSubdomain).catch(() => undefined);
      return await this.complete(request, dbSummary as Record<string, number>, storageSummary);
    } catch (error: any) {
      await this.prisma.schoolDeletionRequest.update({ where: { id }, data: { status: 'FAILED', errorMessage: String(error?.message || error).slice(0, 1000) } });
      throw error;
    }
  }

  async download(id: string) {
    const request = await this.get(id);
    if (request.status !== 'COMPLETED' || !request.reportStorageKey) throw new NotFoundException('Deletion report not available');
    return { download: this.storage.presignPrivateDownload(request.reportStorageKey, 300), checksum: request.reportChecksum };
  }

  private async complete(request: any, dbSummary: Record<string, number>, storageSummary: Record<string, unknown>) {
    const { keyId, privateKey } = this.signingKey();
    const completedAt = new Date();
    const payload = { requestId: request.id, schoolId: request.deletedSchoolId, schoolName: request.schoolName, schoolSubdomain: request.schoolSubdomain, reason: request.reason, requestedBy: request.requestedBy, approvedBy: request.approvedBy, executedBy: request.executedBy, changeTicket: request.changeTicket, requestedAt: request.requestedAt.toISOString(), approvedAt: request.approvedAt?.toISOString(), completedAt: completedAt.toISOString(), dbSummary, storageSummary, databaseVerifiedEmpty: true, objectStorageVerifiedEmpty: true, keyId };
    const signature = sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
    const body = Buffer.from(JSON.stringify({ payload, signature }));
    const checksum = createHash('sha256').update(body).digest('hex');
    const storageKey = `reports/schools/deletion/${request.deletedSchoolId}/${completedAt.getTime()}/${checksum}.json`;
    await this.storage.putPrivateImmutable(storageKey, body, 'application/json', checksum);
    return this.prisma.schoolDeletionRequest.update({ where: { id: request.id }, data: { status: 'COMPLETED', completedAt, dbSummary: dbSummary as Prisma.InputJsonValue, storageSummary: storageSummary as Prisma.InputJsonValue, reportStorageKey: storageKey, reportChecksum: checksum, reportKeyId: keyId, reportPayload: payload as Prisma.InputJsonValue, reportSignature: signature, errorMessage: null } });
  }

  private signingKey() {
    const keyId = (process.env.SCHOOL_DELETION_REPORT_KEY_ID || process.env.EXTENSION_PURGE_REPORT_KEY_ID)?.trim();
    const encoded = (process.env.SCHOOL_DELETION_REPORT_PRIVATE_KEY_BASE64 || process.env.EXTENSION_PURGE_REPORT_PRIVATE_KEY_BASE64)?.trim();
    if (!keyId || !encoded) throw new ServiceUnavailableException('School deletion report signing is not configured');
    try { return { keyId, privateKey: createPrivateKey(Buffer.from(encoded, 'base64').toString('utf8')) }; }
    catch { throw new ServiceUnavailableException('School deletion report private key is invalid'); }
  }

  private async assertNoLegalHold(schoolId: string) {
    const hold = await this.prisma.dataLegalHold.findFirst({ where: { schoolId, active: true }, select: { caseReference: true } });
    if (hold) throw new ConflictException(`School deletion is blocked by legal hold ${hold.caseReference}`);
  }

  private async countTenantRows(schoolId: string) {
    const summary: Record<string, number> = {};
    for (const model of TENANT_SCOPED_MODELS) {
      const delegate = (this.prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)];
      if (delegate?.count) summary[model] = await delegate.count({ where: { schoolId } });
    }
    return summary;
  }

  private async get(id: string) {
    const request = await this.prisma.schoolDeletionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('School deletion request not found');
    return request;
  }
}
