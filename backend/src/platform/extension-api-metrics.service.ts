import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ExtensionApiMetricsService {
  constructor(private prisma: PrismaService) {}

  async record(route: string, method: string, statusCode: number, durationMs: number, schoolId: string) {
    const now = new Date();
    const bucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const errorCount = statusCode >= 400 ? 1 : 0;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ExtensionApiMetric" (
        "id", "bucket", "route", "method", "statusClass", "schoolId",
        "requestCount", "errorCount", "totalDurationMs", "maxDurationMs", "createdAt", "updatedAt"
      ) VALUES (
        ${`${bucket.getTime()}-${method}-${route}-${statusClass}-${schoolId}`}, ${bucket}, ${route}, ${method}, ${statusClass}, ${schoolId},
        1, ${errorCount}, ${durationMs}, ${durationMs}, NOW(), NOW()
      )
      ON CONFLICT ("bucket", "route", "method", "statusClass", "schoolId") DO UPDATE SET
        "requestCount" = "ExtensionApiMetric"."requestCount" + 1,
        "errorCount" = "ExtensionApiMetric"."errorCount" + ${errorCount},
        "totalDurationMs" = "ExtensionApiMetric"."totalDurationMs" + ${durationMs},
        "maxDurationMs" = GREATEST("ExtensionApiMetric"."maxDurationMs", ${durationMs}),
        "updatedAt" = NOW()
    `);
  }

  async summary(hours = 24) {
    const since = new Date(Date.now() - Math.min(Math.max(hours, 1), 24 * 30) * 60 * 60 * 1000);
    const rows = await this.prisma.extensionApiMetric.findMany({ where: { bucket: { gte: since } }, orderBy: { bucket: 'asc' } });
    const totals = rows.reduce((result, row) => ({
      requests: result.requests + row.requestCount,
      errors: result.errors + row.errorCount,
      durationMs: result.durationMs + row.totalDurationMs,
      maxDurationMs: Math.max(result.maxDurationMs, row.maxDurationMs),
    }), { requests: 0, errors: 0, durationMs: 0, maxDurationMs: 0 });
    return {
      since: since.toISOString(),
      requests: totals.requests,
      errors: totals.errors,
      errorRate: totals.requests ? Number(((totals.errors / totals.requests) * 100).toFixed(2)) : 0,
      averageDurationMs: totals.requests ? Number((totals.durationMs / totals.requests).toFixed(2)) : 0,
      maxDurationMs: totals.maxDurationMs,
      routes: rows,
    };
  }
}
