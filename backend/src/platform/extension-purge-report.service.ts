import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPrivateKey, sign } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { AuditService } from '../audit/audit.service';
import { dateIdPage, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

interface RecordPurgeInput {
  schoolId: string;
  extensionId?: string | null;
  installationId?: string | null;
  scope: 'INSTALLATION' | 'EXTENSION';
  trigger: 'MANUAL' | 'SCHEDULED';
  reason?: string | null;
  actor?: Actor;
  dbSummary: Record<string, number>;
}

/**
 * Generates a signed, immutable audit record every time extension data is
 * permanently purged (manual PURGE_INSTALLATION/PURGE_EXTENSION commands or
 * the scheduled uninstall-grace-period cron). Signed with a platform-owned
 * Ed25519 key — deliberately separate from EXTENSION_SIGNING_* (publisher
 * package-trust keys, wrong trust domain for an operational report) — so a
 * downloaded report verifies standalone against the documented public key,
 * with no API/DB dependency. See docs/extension-lifecycle-jobs.md.
 */
@Injectable()
export class ExtensionPurgeReportService {
  constructor(
    private prisma: PrismaService,
    private storage: R2StorageService,
    private audit: AuditService,
  ) {}

  async record(input: RecordPurgeInput) {
    const report = await this.prepare(input);
    return this.finalize(report.id, input.actor);
  }

  assertConfigured() {
    this.signingKey();
  }

  async prepare(input: RecordPurgeInput, client: any = this.prisma) {
    const { keyId, privateKey } = this.signingKey();
    const purgedAt = new Date();
    const payload = {
      schoolId: input.schoolId,
      extensionId: input.extensionId ?? null,
      installationId: input.installationId ?? null,
      scope: input.scope,
      trigger: input.trigger,
      reason: input.reason ?? null,
      actor: input.actor
        ? { id: input.actor.userId ?? null, role: input.actor.role ?? null, name: input.actor.name ?? null, email: input.actor.email ?? null }
        : null,
      purgedAt: purgedAt.toISOString(),
      dbSummary: input.dbSummary,
      keyId,
    };
    const canonical = Buffer.from(JSON.stringify(payload));
    const signature = sign(null, canonical, privateKey).toString('base64');
    const body = Buffer.from(JSON.stringify({ payload, signature }));
    const reportChecksum = createHash('sha256').update(body).digest('hex');
    const storageKey = `reports/extensions/purge/${input.schoolId}/${purgedAt.getTime()}-${reportChecksum.slice(0, 12)}.json`;

    return client.extensionPurgeReport.create({
      data: {
        schoolId: input.schoolId,
        extensionId: input.extensionId ?? null,
        installationId: input.installationId ?? null,
        scope: input.scope,
        trigger: input.trigger,
        reason: input.reason ?? null,
        actorId: input.actor?.userId,
        actorRole: input.actor?.role,
        actorName: input.actor?.name,
        actorEmail: input.actor?.email,
        purgedAt,
        storageKey,
        reportKeyId: keyId,
        reportChecksum,
        deliveryStatus: 'PENDING',
        reportPayload: payload,
        reportSignature: signature,
      },
    });
  }

  private signingKey() {
    const keyId = process.env.EXTENSION_PURGE_REPORT_KEY_ID?.trim();
    const privateKeyBase64 = process.env.EXTENSION_PURGE_REPORT_PRIVATE_KEY_BASE64?.trim();
    if (!keyId || !privateKeyBase64) {
      throw new ServiceUnavailableException('Extension purge report signing is not configured');
    }
    let privateKey;
    try {
      privateKey = createPrivateKey(Buffer.from(privateKeyBase64, 'base64').toString('utf8'));
    } catch {
      throw new ServiceUnavailableException('Extension purge report private key is invalid');
    }

    return { keyId, privateKey };
  }

  async finalize(reportId: string, actor?: Actor) {
    const report = await this.prisma.extensionPurgeReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Extension purge report not found');
    if (report.deliveryStatus === 'AVAILABLE') return report;
    if (!report.reportPayload || !report.reportSignature) {
      throw new ServiceUnavailableException('Pending extension purge report payload is unavailable');
    }
    const body = Buffer.from(JSON.stringify({ payload: report.reportPayload, signature: report.reportSignature }));
    try {
      await this.storage.putPrivate(report.storageKey, body, 'application/json');
      const delivered = await this.prisma.extensionPurgeReport.update({
        where: { id: report.id },
        data: { deliveryStatus: 'AVAILABLE', deliveredAt: new Date(), deliveryError: null },
      });
      await this.log(actor, 'PURGE_REPORT_GENERATED', report.id, report.scope, {
        trigger: report.trigger,
        installationId: report.installationId ?? undefined,
        extensionId: report.extensionId ?? undefined,
      });
      return delivered;
    } catch (error: any) {
      await this.prisma.extensionPurgeReport.updateMany({
        where: { id: report.id, deliveryStatus: 'PENDING' },
        data: { deliveryError: String(error?.message || error).slice(0, 1000) },
      }).catch(() => undefined);
      throw error;
    }
  }

  async retryPending(limit = 100) {
    const pending = await this.prisma.extensionPurgeReport.findMany({
      where: { deliveryStatus: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    let delivered = 0;
    for (const report of pending) {
      try {
        await this.finalize(report.id);
        delivered += 1;
      } catch {
        // Keep the durable payload pending for the next scheduled retry.
      }
    }
    return delivered;
  }

  async list(input: { schoolId?: string; cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const rows = await this.prisma.extensionPurgeReport.findMany({
      where: {
        deliveryStatus: 'AVAILABLE',
        ...(input.schoolId ? { schoolId: input.schoolId } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  async downloadUrl(reportId: string, actor: Actor) {
    const report = await this.prisma.extensionPurgeReport.findUnique({
      where: { id: reportId },
      select: { storageKey: true, scope: true, deliveryStatus: true },
    });
    if (!report || report.deliveryStatus !== 'AVAILABLE') throw new NotFoundException('Extension purge report not found');
    await this.log(actor, 'PURGE_REPORT_ACCESS', reportId, report.scope, { access: 'SIGNED_DOWNLOAD_URL' });
    return { download: this.storage.presignPrivateDownload(report.storageKey) };
  }

  private log(actor: Actor | undefined, action: string, resourceId: string, resourceLabel: string, metadata: Record<string, unknown>) {
    return this.audit.log({
      actorId: actor?.userId,
      actorRole: actor?.role,
      actorName: actor?.name,
      actorEmail: actor?.email,
      action,
      resource: 'EXTENSION_PURGE_REPORT',
      resourceId,
      resourceLabel,
      metadata,
    });
  }
}
