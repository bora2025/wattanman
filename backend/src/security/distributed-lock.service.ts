import { ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { assertProductionRedisUrl } from './redis-url';

@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, { owner: string; expiresAt: number }>();
  private readonly ttlMs = this.numberSetting('EXTENSION_COMMAND_LOCK_MS', 120_000, 5_000, 900_000);

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (process.env.NODE_ENV === 'production' && !url)
      throw new Error('Production REDIS_URL is required for distributed command locks');
    if (url) assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async run<T>(resource: string, operation: () => Promise<T>): Promise<T> {
    const key = `command-lock:${this.normalize(resource)}`;
    const owner = randomUUID();
    if (!(await this.acquire(key, owner)))
      throw new ConflictException('Another command is already changing this school extension');
    try {
      return await operation();
    } finally {
      await this.release(key, owner).catch(() => undefined);
    }
  }

  private async acquire(key: string, owner: string) {
    if (this.redis) return (await this.redis.set(key, owner, 'PX', this.ttlMs, 'NX')) === 'OK';
    const now = Date.now();
    for (const [existing, lock] of this.local) if (lock.expiresAt <= now) this.local.delete(existing);
    if (this.local.has(key)) return false;
    this.local.set(key, { owner, expiresAt: now + this.ttlMs });
    return true;
  }

  private async release(key: string, owner: string) {
    if (this.redis) {
      await this.redis.eval(
        `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`,
        1,
        key,
        owner,
      );
      return;
    }
    if (this.local.get(key)?.owner === owner) this.local.delete(key);
  }

  private normalize(value: string) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, '-').slice(0, 300);
    if (!normalized) throw new Error('Distributed lock resource is required');
    return normalized;
  }

  private numberSetting(name: string, fallback: number, min: number, max: number) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
