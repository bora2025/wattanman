import { HttpException, HttpStatus, Injectable, OnModuleDestroy, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import IORedis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { assertProductionRedisUrl } from '../security/redis-url';

type LocalCounter = { count: number; expiresAt: number };

@Injectable()
export class ExtensionResourceGovernorService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, LocalCounter>();

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.REDIS_URL?.trim();
    if (process.env.NODE_ENV === 'production' && !url) throw new Error('Production REDIS_URL is required for extension resource governance');
    if (url) assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async enterRequest(schoolId: string, extensionKey: string) {
    const extension = this.normalize(extensionKey || 'navigation');
    await this.consume(`requests:school:${schoolId}`, this.setting('EXTENSION_SCHOOL_REQUESTS_PER_MINUTE', 3_000, 60, 100_000), 60_000, schoolId, extension, 'REQUEST_QUOTA');
    await this.consume(`requests:extension:${extension}`, this.setting('EXTENSION_GLOBAL_REQUESTS_PER_MINUTE', 30_000, 100, 1_000_000), 60_000, schoolId, extension, 'REQUEST_QUOTA');
    const schoolKey = `concurrency:school:${schoolId}`;
    const extensionKeyName = `concurrency:extension:${extension}`;
    await this.acquire(schoolKey, this.setting('EXTENSION_SCHOOL_CONCURRENCY', 50, 1, 10_000), schoolId, extension);
    try {
      await this.acquire(extensionKeyName, this.setting('EXTENSION_GLOBAL_CONCURRENCY', 500, 1, 100_000), schoolId, extension);
    } catch (error) {
      await this.release(schoolKey);
      throw error;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await Promise.all([this.release(schoolKey), this.release(extensionKeyName)]);
    };
  }

  async consumeExport(schoolId: string, extensionKey: string, records: number) {
    const maximumRecords = this.exportRecordLimit();
    if (records > maximumRecords) throw new PayloadTooLargeException(`Extension export exceeds the ${maximumRecords} record limit`);
    const extension = this.normalize(extensionKey);
    await this.consume(`exports:school:${schoolId}`, this.setting('EXTENSION_SCHOOL_EXPORTS_PER_HOUR', 100, 1, 100_000), 3_600_000, schoolId, extension, 'EXPORT_QUOTA');
    await this.consume(`exports:extension:${extension}`, this.setting('EXTENSION_GLOBAL_EXPORTS_PER_HOUR', 1_000, 1, 1_000_000), 3_600_000, schoolId, extension, 'EXPORT_QUOTA');
  }

  exportRecordLimit() { return this.setting('EXTENSION_EXPORT_RECORD_LIMIT', 10_000, 1, 100_000); }

  jobQuotas() {
    return {
      school: this.setting('EXTENSION_SCHOOL_ACTIVE_JOBS', 25, 1, 10_000),
      extension: this.setting('EXTENSION_GLOBAL_ACTIVE_JOBS', 500, 1, 100_000),
    };
  }

  storageQuotas() {
    return {
      installationBytes: this.setting('EXTENSION_DATA_QUOTA_BYTES', 100 * 1024 * 1024, 1024 * 1024, 2_000_000_000),
      installationRecords: this.setting('EXTENSION_RECORD_QUOTA', 100_000, 100, 10_000_000),
      schoolBytes: this.setting('EXTENSION_SCHOOL_DATA_QUOTA_BYTES', 1024 * 1024 * 1024, 1024 * 1024, 2_000_000_000),
      schoolRecords: this.setting('EXTENSION_SCHOOL_RECORD_QUOTA', 1_000_000, 100, 50_000_000),
    };
  }

  private async consume(key: string, limit: number, ttlMs: number, schoolId: string, extensionKey: string, type: string) {
    const count = this.redis
      ? Number(await this.redis.eval(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n`, 1, `extension-quota:${key}`, ttlMs))
      : this.localIncrement(key, ttlMs);
    if (count <= limit) return;
    await this.violation(type, schoolId, extensionKey, count, limit);
    throw new HttpException(`Extension ${type.toLowerCase().replace('_', ' ')} exceeded`, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async acquire(key: string, limit: number, schoolId: string, extensionKey: string) {
    const count = this.redis
      ? Number(await this.redis.eval(`local n=redis.call('INCR',KEYS[1]); redis.call('PEXPIRE',KEYS[1],ARGV[1]); if n>tonumber(ARGV[2]) then redis.call('DECR',KEYS[1]) end; return n`, 1, `extension-quota:${key}`, 300_000, limit))
      : this.localAcquire(key, 300_000, limit);
    if (count <= limit) return;
    await this.violation('CONCURRENCY_QUOTA', schoolId, extensionKey, count, limit);
    throw new ServiceUnavailableException('Extension concurrency quota exceeded');
  }

  private async release(key: string) {
    if (this.redis) {
      await this.redis.eval(`local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n<=1 then redis.call('DEL',KEYS[1]); return 0 end; return redis.call('DECR',KEYS[1])`, 1, `extension-quota:${key}`).catch(() => undefined);
    } else {
      const value = this.local.get(key);
      if (!value || value.count <= 1) this.local.delete(key);
      else value.count -= 1;
    }
  }

  private localIncrement(key: string, ttlMs: number) {
    const now = Date.now();
    const value = this.local.get(key);
    const next = !value || value.expiresAt <= now ? { count: 1, expiresAt: now + ttlMs } : { ...value, count: value.count + 1 };
    this.local.set(key, next);
    return next.count;
  }

  private localAcquire(key: string, ttlMs: number, limit: number) {
    const count = this.localIncrement(key, ttlMs);
    if (count > limit) this.release(key);
    return count;
  }

  private async violation(type: string, schoolId: string, extensionKey: string, count: number, limit: number) {
    const fingerprint = `RESOURCE_QUOTA:${type}:${schoolId}:${extensionKey}`;
    await this.prisma.extensionAlert.upsert({
      where: { fingerprint },
      create: { fingerprint, type: 'RESOURCE_QUOTA', severity: count >= limit * 2 ? 'CRITICAL' : 'WARNING', schoolId, message: `${extensionKey} exceeded ${type} (${count}/${limit})`, occurrences: 1, details: { extensionKey, quota: type, count, limit } },
      update: { status: 'OPEN', severity: count >= limit * 2 ? 'CRITICAL' : 'WARNING', message: `${extensionKey} exceeded ${type} (${count}/${limit})`, occurrences: { increment: 1 }, details: { extensionKey, quota: type, count, limit }, lastSeenAt: new Date(), resolvedAt: null, resolvedBy: null },
    }).catch(() => undefined);
  }

  private normalize(value: string) { return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64) || 'UNKNOWN'; }
  private setting(name: string, fallback: number, minimum: number, maximum: number) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
  }

  async onModuleDestroy() { if (this.redis) await this.redis.quit().catch(() => undefined); }
}
