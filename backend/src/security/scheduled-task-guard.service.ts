import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { assertProductionRedisUrl } from './redis-url';

@Injectable()
export class ScheduledTaskGuardService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, number>();

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (process.env.NODE_ENV === 'production' && !url) throw new Error('Production REDIS_URL is required for scheduled task coordination');
    if (url) assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async acquire(task: string, windowMs: number, now = Date.now()): Promise<boolean> {
    if (!task.trim() || !Number.isInteger(windowMs) || windowMs < 1_000) throw new Error('Invalid scheduled task claim');
    const bucket = Math.floor(now / windowMs);
    const key = `scheduled-task:${task.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')}:${bucket}`;
    const ttlMs = windowMs * 2;
    if (this.redis) return (await this.redis.set(key, String(now), 'PX', ttlMs, 'NX')) === 'OK';
    for (const [existing, expiresAt] of this.local) if (expiresAt <= now) this.local.delete(existing);
    if (this.local.has(key)) return false;
    this.local.set(key, now + ttlMs);
    return true;
  }

  async onModuleDestroy() { if (this.redis) await this.redis.quit().catch(() => undefined); }
}
