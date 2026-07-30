import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * The cross-school "requests inbox" a PLATFORM_ADMIN checks instead of
 * having to guess what a school wants — Phase 10's in-app-queue-only
 * alerting (no email). Every query here is deliberately unscoped: it's the
 * platform tier's own view across every tenant, same shape as
 * SchoolsService.stats().
 */
@Injectable()
export class AddonRequestsService {
  constructor(private prisma: PrismaService) {}

  private pendingWhere() {
    return { requestedAt: { not: null }, enabled: false } as const;
  }

  async list() {
    const rows = await this.prisma.schoolAddon.findMany({
      where: this.pendingWhere(),
      orderBy: { requestedAt: 'asc' }, // oldest request first
      include: { school: true, addonDefinition: true },
    });
    const requesterIds = [...new Set(rows.map((r) => r.requestedBy).filter((id): id is string => !!id))];
    const requesters = requesterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
      : [];
    const requesterById = new Map(requesters.map((u) => [u.id, u]));

    return rows.map((r) => ({
      schoolId: r.schoolId,
      schoolName: r.school.name,
      schoolSubdomain: r.school.subdomain,
      addonKey: r.addonKey,
      addonName: r.addonDefinition.name,
      icon: r.addonDefinition.icon,
      price: r.addonDefinition.price,
      priceNote: r.addonDefinition.priceNote,
      requestedAt: r.requestedAt,
      requestedBy: r.requestedBy ? (requesterById.get(r.requestedBy) ?? null) : null,
    }));
  }

  async count() {
    return this.prisma.schoolAddon.count({ where: this.pendingWhere() });
  }
}
