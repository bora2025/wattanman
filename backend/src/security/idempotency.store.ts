import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

export type IdempotencyRecord = { fingerprint: string; state: 'PROCESSING' | 'COMPLETED'; statusCode?: number; response?: unknown };

@Injectable()
export class IdempotencyStore implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();
  private readonly ttlMs = Number(process.env.IDEMPOTENCY_TTL_MS || 24 * 60 * 60_000);

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (process.env.NODE_ENV === 'production' && !url) throw new Error('Production REDIS_URL is required for idempotency storage');
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async reserve(key: string, fingerprint: string): Promise<{ acquired: boolean; record: IdempotencyRecord }> {
    const redisKey = `idempotency:${key}`;
    const processing: IdempotencyRecord = { fingerprint, state: 'PROCESSING' };
    if (this.redis) {
      const acquired = await this.redis.set(redisKey, JSON.stringify(processing), 'PX', this.ttlMs, 'NX');
      if (acquired === 'OK') return { acquired: true, record: processing };
      const existing = await this.redis.get(redisKey);
      if (!existing) return this.reserve(key, fingerprint);
      return { acquired: false, record: JSON.parse(existing) };
    }
    const existing = this.local.get(redisKey);
    if (existing && existing.expiresAt > Date.now()) return { acquired: false, record: existing.record };
    this.local.set(redisKey, { record: processing, expiresAt: Date.now() + this.ttlMs });
    return { acquired: true, record: processing };
  }

  async complete(key: string, record: IdempotencyRecord) {
    const redisKey = `idempotency:${key}`;
    if (this.redis) await this.redis.set(redisKey, JSON.stringify(record), 'PX', this.ttlMs, 'XX');
    else this.local.set(redisKey, { record, expiresAt: Date.now() + this.ttlMs });
  }

  async release(key: string, fingerprint: string) {
    const redisKey = `idempotency:${key}`;
    if (this.redis) {
      await this.redis.eval(`local v=redis.call('get',KEYS[1]); if v and cjson.decode(v).fingerprint==ARGV[1] and cjson.decode(v).state=='PROCESSING' then return redis.call('del',KEYS[1]) end return 0`, 1, redisKey, fingerprint);
    } else if (this.local.get(redisKey)?.record.fingerprint === fingerprint) this.local.delete(redisKey);
  }

  async onModuleDestroy() { if (this.redis) await this.redis.quit().catch(() => undefined); }
}
