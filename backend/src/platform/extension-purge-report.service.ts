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
    // Canonical bytes for signing are exactly this JSON.stringify output. A verifier
    // reconstructs it the same way (JSON.parse the downloaded report's `payload`, then
    // JSON.stringify it again) — V8 preserves object key insertion order on both ends,
    // so no separate canonicalization step is needed.
    const canonical = Buffer.from(JSON.stringify(payload));
    const signature = sign(null, canonical, privateKey).toString('base64');
    const body = Buffer.from(JSON.stringify({ payload, signature }));
    const reportChecksum = createHash('sha256').update(body).digest('hex');
    const storageKey = `reports/extensions/purge/${input.schoolId}/${purgedAt.getTime()}-${reportChecksum.slice(0, 12)}.json`;

    await this.storage.putPrivate(storageKey, body, 'application/json');
    const report = await this.prisma.extensionPurgeReport.create({
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
      },
    });
    await this.log(input.actor, 'PURGE_REPORT_GENERATED', report.id, input.scope, {
      trigger: input.trigger,
      installationId: input.installationId ?? undefined,
      extensionId: input.extensionId ?? undefined,
    });
    return report;
  }

  async list(input: { schoolId?: string; cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const rows = await this.prisma.extensionPurgeReport.findMany({
      where: {
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
      select: { storageKey: true, scope: true },
    });
    if (!report) throw new NotFoundException('Extension purge report not found');
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
