import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../tenancy/constants';

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Phase 13 of the multi-tenant conversion plan — per-school daily usage/speed
 * rollup for the Platform tier, so a platform admin can tell "this school is
 * just busy today" apart from "something's actually wrong."
 *
 * Deliberately reads from the existing AuditLog table (already records every
 * mutating request's schoolId/actorId/success/durationMs) rather than adding
 * new instrumentation, but never queries AuditLog live for the dashboard —
 * each school's own AuditCleanupSchedule can hard-delete rows after as few as
 * a handful of days, which would make a live-queried usage trend silently
 * gappy. Instead this finalizes one row per school per day into
 * SchoolDailyMetric, which persists independently of that retention setting.
 */
@Injectable()
export class SchoolMetricsService {
  private readonly logger = new Logger(SchoolMetricsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Runs once daily, 5 minutes past UTC midnight, finalizing YESTERDAY's
   * rollup for every school. A cron job runs outside any HTTP request, so
   * there's no tenant context (AsyncLocalStorage store) open here —
   * PrismaService's middleware passes the school lookup through unscoped,
   * which is what we want: a platform-wide sweep. Every per-school query
   * inside computeForDate() is then explicitly scoped by that school's own
   * id, never relying on ambient context — same pattern as
   * AuditService.runScheduledCleanup().
   */
  @Cron('5 0 * * *')
  async runDailyRollup(): Promise<void> {
    const yesterday = utcMidnight(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const result = await this.computeForDate(yesterday);
    this.logger.log(`Daily rollup for ${result.date}: ${result.schools} schools`);
  }

  /**
   * Compute (or recompute) every school's rollup for one UTC day. Shared by
   * the cron job above and the platform admin's manual recompute endpoint
   * (backfill a past date, or refresh a day without waiting for the next
   * scheduled run).
   */
  async computeForDate(date: Date): Promise<{ date: string; schools: number }> {
    const dayStart = utcMidnight(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    let schools: { id: string; subdomain: string }[];
    try {
      schools = await this.prisma.school.findMany({
        where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
        select: { id: true, subdomain: true },
      });
    } catch (err: any) {
      this.logger.warn(`Daily rollup: failed to load schools – ${err?.message}`);
      return { date: dayStart.toISOString().split('T')[0], schools: 0 };
    }

    for (const school of schools) {
      try {
        await this.computeOneSchool(school.id, dayStart, dayEnd);
      } catch (err: any) {
        this.logger.warn(`Daily rollup failed for school ${school.subdomain}: ${err?.message}`);
      }
    }
    return { date: dayStart.toISOString().split('T')[0], schools: schools.length };
  }

  private async computeOneSchool(schoolId: string, dayStart: Date, dayEnd: Date): Promise<void> {
    const where = { schoolId, createdAt: { gte: dayStart, lt: dayEnd } };
    const [requestCount, errorCount, actors, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({ where: { ...where, success: false } }),
      this.prisma.auditLog.findMany({
        where: { ...where, actorId: { not: null } },
        select: { actorId: true },
        distinct: ['actorId'],
      }),
      // durationMs lives inside AuditInterceptor's `metadata` JSON blob, not
      // a dedicated column — fine to extract here since this only ever reads
      // one school's one day of rows in a background job, off the hot path.
      this.prisma.auditLog.findMany({ where, select: { metadata: true } }),
    ]);

    const durations = rows
      .map((r) => {
        const meta = r.metadata as any;
        const v = meta?.durationMs;
        return typeof v === 'number' ? v : null;
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    const avgDurationMs = durations.length
      ? durations.reduce((sum, v) => sum + v, 0) / durations.length
      : null;
    const p95DurationMs = durations.length
      ? durations[Math.min(durations.length - 1, Math.floor(0.95 * durations.length))]
      : null;

    await this.prisma.schoolDailyMetric.upsert({
      where: { schoolId_date: { schoolId, date: dayStart } },
      create: {
        schoolId,
        date: dayStart,
        requestCount,
        errorCount,
        avgDurationMs,
        p95DurationMs,
        activeUserCount: actors.length,
      },
      update: {
        requestCount,
        errorCount,
        avgDurationMs,
        p95DurationMs,
        activeUserCount: actors.length,
        computedAt: new Date(),
      },
    });
  }

  // ── Reads for the platform dashboard ────────────────────────────────────
  // Both methods below are only ever called from a controller behind
  // PlatformScopeGuard, so they run in 'unscoped' tenant mode by ambient
  // AsyncLocalStorage context — same convention as AddonRequestsService.

  /** One row per school for the given day (defaults to yesterday, since
   * today isn't finalized until the next rollup run). */
  async listForDate(date?: Date) {
    const dayStart = utcMidnight(date ?? new Date(Date.now() - 24 * 60 * 60 * 1000));
    const [metrics, schools] = await Promise.all([
      this.prisma.schoolDailyMetric.findMany({ where: { date: dayStart } }),
      this.prisma.school.findMany({
        where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
        select: { id: true, name: true, subdomain: true },
      }),
    ]);
    const byId = new Map(metrics.map((m) => [m.schoolId, m]));
    return {
      date: dayStart.toISOString().split('T')[0],
      schools: schools.map((s) => {
        const m = byId.get(s.id);
        return {
          schoolId: s.id,
          schoolName: s.name,
          schoolSubdomain: s.subdomain,
          requestCount: m?.requestCount ?? 0,
          errorCount: m?.errorCount ?? 0,
          avgDurationMs: m?.avgDurationMs ?? null,
          p95DurationMs: m?.p95DurationMs ?? null,
          activeUserCount: m?.activeUserCount ?? 0,
          computed: !!m,
        };
      }),
    };
  }

  /** One school's last `days` finalized days, oldest first — powers the
   * per-school trend chart. */
  async trendForSchool(schoolId: string, days: number) {
    const since = utcMidnight(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    const rows = await this.prisma.schoolDailyMetric.findMany({
      where: { schoolId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      requestCount: r.requestCount,
      errorCount: r.errorCount,
      avgDurationMs: r.avgDurationMs,
      p95DurationMs: r.p95DurationMs,
      activeUserCount: r.activeUserCount,
    }));
  }
}
