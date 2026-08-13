import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { TelemetryMetricsService } from '../telemetry/telemetry-metrics.service';

@Injectable()
export class ObservabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueInfrastructureService,
    private readonly storage: R2StorageService,
    private readonly telemetry: TelemetryMetricsService,
  ) {}

  async snapshot(minutes = 60) {
    const queueNames = (process.env.QUEUE_MONITORED_NAMES || 'operations,extensions,notifications').split(',').map((name) => name.trim()).filter(Boolean);
    const [api, database, redis, r2, queueResults, schoolUsage, extensionUsage] = await Promise.all([
      this.telemetry.summary(minutes),
      this.databaseHealth(),
      this.telemetry.redisHealth(),
      this.storage.health(),
      Promise.all(queueNames.map(async (name) => {
        try { return await this.queues.health(name); }
        catch (error: any) { return { queue: name, status: 'unhealthy', error: error?.message || 'Queue probe failed' }; }
      })),
      this.prisma.runInControlPlane((client) => client.school.findMany({
        orderBy: { extensionDataBytes: 'desc' }, take: 10,
        select: { id: true, subdomain: true, extensionDataBytes: true, extensionDataRecords: true },
      })),
      this.prisma.runInControlPlane((client) => client.extensionInstallation.findMany({
        orderBy: { dataBytes: 'desc' }, take: 10,
        select: { id: true, schoolId: true, dataBytes: true, dataRecords: true, extension: { select: { id: true, key: true, name: true } } },
      })),
    ]);
    return { api, dependencies: { database, redis, r2 }, queues: queueResults, usage: { schools: schoolUsage, extensions: extensionUsage }, generatedAt: new Date().toISOString() };
  }

  private async databaseHealth() {
    const started = Date.now();
    try {
      const rows = await this.prisma.runInControlPlane((client) => client.$queryRaw<Array<{ active: bigint; total: bigint; max_connections: number }>>`
        SELECT
          count(*) FILTER (WHERE state = 'active')::bigint AS active,
          count(*)::bigint AS total,
          current_setting('max_connections')::int AS max_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const row = rows[0];
      return { status: 'healthy', latencyMs: Date.now() - started, activeConnections: Number(row?.active || 0), totalConnections: Number(row?.total || 0), maxConnections: Number(row?.max_connections || 0) };
    } catch (error: any) {
      return { status: 'unhealthy', latencyMs: Date.now() - started, error: error?.message || 'Database probe failed' };
    }
  }
}
