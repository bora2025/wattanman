import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { dateIdPageBy, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';

const WINDOW_HOURS = 24;
const VALIDATION_FAILURE_THRESHOLD = 3;
const CAPABILITY_DENIED_THRESHOLD = 5;

@Injectable()
export class ExtensionAlertService {
  constructor(private prisma: PrismaService) {}

  @Cron('15 * * * *')
  async scan() {
    if (process.env.WORKER_ROLE && process.env.WORKER_ROLE !== 'extension') return;
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
    const [validationGroups, capabilityGroups] = await Promise.all([
      this.prisma.extensionValidation.groupBy({
        by: ['extensionVersionId'],
        where: { status: { in: ['FAILED', 'TIMED_OUT'] }, startedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['schoolId', 'resourceId'],
        where: { action: 'CAPABILITY_DENIED', resource: 'EXTENSION_RUNTIME', createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    let raised = 0;
    for (const group of validationGroups.filter((item) => item._count._all >= VALIDATION_FAILURE_THRESHOLD)) {
      const version = await this.prisma.extensionVersion.findUnique({
        where: { id: group.extensionVersionId },
        include: { extension: { select: { id: true, key: true, name: true } } },
      });
      if (!version) continue;
      await this.raise({
        fingerprint: `VALIDATION_FAILURE:${version.id}`,
        type: 'VALIDATION_FAILURE',
        severity: group._count._all >= VALIDATION_FAILURE_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
        extensionId: version.extension.id,
        versionId: version.id,
        message: `${version.extension.name} v${version.version} failed validation ${group._count._all} times in ${WINDOW_HOURS} hours`,
        occurrences: group._count._all,
        details: { extensionKey: version.extension.key, windowHours: WINDOW_HOURS },
      });
      raised += 1;
    }

    for (const group of capabilityGroups.filter((item) => item._count._all >= CAPABILITY_DENIED_THRESHOLD)) {
      const extension = group.resourceId
        ? await this.prisma.extension.findUnique({ where: { key: group.resourceId }, select: { id: true, key: true, name: true } })
        : null;
      await this.raise({
        fingerprint: `CAPABILITY_DENIED:${group.schoolId}:${group.resourceId || 'UNKNOWN'}`,
        type: 'CAPABILITY_DENIED',
        severity: group._count._all >= CAPABILITY_DENIED_THRESHOLD * 2 ? 'CRITICAL' : 'WARNING',
        extensionId: extension?.id,
        schoolId: group.schoolId,
        message: `${extension?.name || group.resourceId || 'Unknown extension'} had ${group._count._all} denied capability attempts in ${WINDOW_HOURS} hours`,
        occurrences: group._count._all,
        details: { extensionKey: extension?.key || group.resourceId, windowHours: WINDOW_HOURS },
      });
      raised += 1;
    }
    return { raised };
  }

  async list(cursorValue?: string, limitValue?: string) {
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.extensionAlert.findMany({
      where: cursor ? { OR: [{ lastSeenAt: { lt: cursor.createdAt } }, { lastSeenAt: cursor.createdAt, id: { lt: cursor.id } }] } : undefined,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return dateIdPageBy(rows, limit, (row) => row.lastSeenAt);
  }

  async setStatus(id: string, status: string, actorId?: string) {
    if (!['ACKNOWLEDGED', 'RESOLVED'].includes(status)) throw new BadRequestException('Alert status must be ACKNOWLEDGED or RESOLVED');
    const now = new Date();
    return this.prisma.extensionAlert.update({
      where: { id },
      data: status === 'ACKNOWLEDGED'
        ? { status, acknowledgedBy: actorId, acknowledgedAt: now, resolvedBy: null, resolvedAt: null }
        : { status, resolvedBy: actorId, resolvedAt: now },
    });
  }

  private raise(input: {
    fingerprint: string; type: string; severity: string; extensionId?: string; versionId?: string;
    schoolId?: string; message: string; occurrences: number; details: Prisma.InputJsonObject;
  }) {
    return this.prisma.extensionAlert.upsert({
      where: { fingerprint: input.fingerprint },
      create: input,
      update: {
        type: input.type,
        severity: input.severity,
        status: 'OPEN',
        extensionId: input.extensionId,
        versionId: input.versionId,
        schoolId: input.schoolId,
        message: input.message,
        occurrences: input.occurrences,
        details: input.details,
        lastSeenAt: new Date(),
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
      },
    });
  }
}
