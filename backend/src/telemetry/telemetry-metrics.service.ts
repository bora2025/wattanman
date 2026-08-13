import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { assertProductionRedisUrl } from '../security/redis-url';

const RETENTION_SECONDS = 2 * 60 * 60;
const BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

type Bucket = Record<string, number>;

@Injectable()
export class TelemetryMetricsService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, Bucket>();
  private inFlight = 0;
  private peakInFlight = 0;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  begin() {
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    let finished = false;
    return async (statusCode: number, durationMs: number) => {
      if (finished) return;
      finished = true;
      this.inFlight = Math.max(0, this.inFlight - 1);
      await this.record(statusCode, durationMs);
    };
  }

  async summary(minutes = 60) {
    const boundedMinutes = Math.min(Math.max(minutes, 5), 120);
    const keys = Array.from({ length: boundedMinutes }, (_, index) => this.key(new Date(Date.now() - index * 60_000)));
    const rows: Array<Record<string, string | number>> = this.redis
      ? await this.readRedis(keys).catch(() => keys.map((key) => this.local.get(key) || {}))
      : keys.map((key) => this.local.get(key) || {});
    const totals = rows.reduce<Bucket>((aggregate, row) => {
      for (const [field, value] of Object.entries(row)) aggregate[field] = Number(aggregate[field] || 0) + Number(value || 0);
      return aggregate;
    }, {} as Bucket);
    const requests = totals.requests || 0;
    const errors = totals.errors || 0;
    const maxLatencyMs = Math.max(0, ...rows.map((row) => Number(row.maxLatencyMs || 0)));
    const p95LatencyMs = this.percentile(totals, requests, 0.95, maxLatencyMs);
    return {
      windowMinutes: boundedMinutes,
      requests,
      requestsPerMinute: Number((requests / boundedMinutes).toFixed(2)),
      errors,
      errorRate: requests ? Number(((errors / requests) * 100).toFixed(3)) : 0,
      availability: requests ? Number((((requests - errors) / requests) * 100).toFixed(4)) : 100,
      averageLatencyMs: requests ? Number(((totals.durationMs || 0) / requests).toFixed(2)) : 0,
      p95LatencyMs,
      maxLatencyMs,
      saturation: { inFlight: this.inFlight, peakInFlight: this.peakInFlight, heapUsedBytes: process.memoryUsage().heapUsed, rssBytes: process.memoryUsage().rss },
      generatedAt: new Date().toISOString(),
    };
  }

  async redisHealth() {
    if (!this.redis) return { configured: false, status: 'unconfigured', latencyMs: null };
    const started = Date.now();
    try {
      const [, memory] = await Promise.all([this.redis.ping(), this.redis.info('memory')]);
      const values = Object.fromEntries(memory.split(/\r?\n/).map((line) => line.split(':', 2)).filter((parts) => parts.length === 2));
      const usedMemoryBytes = Number(values.used_memory || 0);
      const maxMemoryBytes = Number(values.maxmemory || 0);
      return {
        configured: true,
        status: 'healthy',
        latencyMs: Date.now() - started,
        usedMemoryBytes,
        maxMemoryBytes,
        memoryUtilizationPct: maxMemoryBytes > 0 ? Number(((usedMemoryBytes / maxMemoryBytes) * 100).toFixed(3)) : null,
      };
    } catch (error: any) {
      return { configured: true, status: 'unhealthy', latencyMs: Date.now() - started, error: error?.message || 'Redis probe failed' };
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  private async record(statusCode: number, durationMs: number) {
    const key = this.key(new Date());
    const bucket = this.local.get(key) || {};
    bucket.requests = (bucket.requests || 0) + 1;
    bucket.errors = (bucket.errors || 0) + (statusCode >= 500 ? 1 : 0);
    bucket.durationMs = (bucket.durationMs || 0) + Math.max(0, Math.round(durationMs));
    bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs || 0, durationMs);
    for (const boundary of BUCKETS) if (durationMs <= boundary) bucket[`le_${boundary}`] = (bucket[`le_${boundary}`] || 0) + 1;
    bucket.le_inf = (bucket.le_inf || 0) + 1;
    this.local.set(key, bucket);
    if (this.local.size > 130) this.local.delete(this.local.keys().next().value);
    if (!this.redis) return;
    const increments: Array<string | number> = ['requests', 1, 'errors', statusCode >= 500 ? 1 : 0, 'durationMs', Math.max(0, Math.round(durationMs)), 'le_inf', 1];
    for (const boundary of BUCKETS) if (durationMs <= boundary) increments.push(`le_${boundary}`, 1);
    const transaction = this.redis.multi();
    for (let index = 0; index < increments.length; index += 2) transaction.hincrby(key, String(increments[index]), Number(increments[index + 1]));
    transaction.eval(`local current=tonumber(redis.call('HGET',KEYS[1],'maxLatencyMs') or '0'); local value=tonumber(ARGV[1]); if value>current then redis.call('HSET',KEYS[1],'maxLatencyMs',value) end; return 1`, 1, key, Math.round(durationMs));
    transaction.expire(key, RETENTION_SECONDS);
    await transaction.exec();
  }

  private async readRedis(keys: string[]) {
    const results = await this.redis!.pipeline(keys.map((key) => ['hgetall', key])).exec();
    return results!.map(([, value]) => value as Record<string, string>);
  }

  private percentile(totals: Bucket, requests: number, percentile: number, maxLatencyMs: number) {
    if (!requests) return 0;
    const target = Math.ceil(requests * percentile);
    for (const boundary of BUCKETS) if ((totals[`le_${boundary}`] || 0) >= target) return boundary;
    return Math.max(BUCKETS[BUCKETS.length - 1], maxLatencyMs);
  }

  private key(date: Date) {
    return `telemetry:http:${date.toISOString().slice(0, 16)}`;
  }
}
