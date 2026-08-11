import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import IORedis from 'ioredis';
import { assertProductionRedisUrl } from './redis-url';

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = 0
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  blocked = 1
elseif count > tonumber(ARGV[2]) then
  blocked = 1
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return {count, ttl, blocked, math.max(blockTtl, 0)}
`;

type ThrottlerStorageRecord = { totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number };

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, { count: number; expiresAt: number; blockedUntil: number }>();

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const namespaced = `throttle:${throttlerName}:${key}`;
    const blockMs = Math.max(blockDuration || ttl, 1);
    if (!this.redis) return this.incrementLocal(namespaced, ttl, limit, blockMs);
    try {
      const result = await this.redis.eval(INCREMENT_SCRIPT, 2, namespaced, `${namespaced}:blocked`, ttl, limit, blockMs) as number[];
      return { totalHits: Number(result[0]), timeToExpire: Number(result[1]), isBlocked: Number(result[2]) === 1, timeToBlockExpire: Number(result[3]) };
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
      return this.incrementLocal(namespaced, ttl, limit, blockMs);
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  private incrementLocal(key: string, ttl: number, limit: number, blockMs: number): ThrottlerStorageRecord {
    const now = Date.now();
    const existing = this.local.get(key);
    const record = !existing || existing.expiresAt <= now ? { count: 0, expiresAt: now + ttl, blockedUntil: 0 } : existing;
    record.count += 1;
    if (record.count > limit && record.blockedUntil <= now) record.blockedUntil = now + blockMs;
    this.local.set(key, record);
    return { totalHits: record.count, timeToExpire: Math.max(0, record.expiresAt - now), isBlocked: record.blockedUntil > now, timeToBlockExpire: Math.max(0, record.blockedUntil - now) };
  }
}
