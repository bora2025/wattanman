import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import IORedis from 'ioredis';
import { assertProductionRedisUrl } from './redis-url';

type LocalState = { failures: number; openedAt?: number; probing?: boolean };

@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly local = new Map<string, LocalState>();
  private readonly failureThreshold = this.positiveInteger('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5);
  private readonly resetTimeoutMs = this.positiveInteger('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 30_000);

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (process.env.NODE_ENV === 'production' && !url) throw new Error('Production REDIS_URL is required for distributed circuit breakers');
    if (url) assertProductionRedisUrl(url);
    this.redis = url ? new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 }) : null;
  }

  async execute<T>(dependency: string, operation: () => Promise<T>): Promise<T> {
    const name = this.name(dependency);
    await this.assertRequestAllowed(name);
    try {
      const result = await operation();
      await this.recordSuccess(name);
      return result;
    } catch (error) {
      await this.recordFailure(name);
      throw error;
    }
  }

  private async assertRequestAllowed(name: string) {
    const now = Date.now();
    if (this.redis) {
      const key = this.key(name);
      const openedAt = Number(await this.redis.hget(key, 'openedAt'));
      if (!openedAt) return;
      if (now - openedAt < this.resetTimeoutMs) throw this.openError(name);
      const probe = await this.redis.set(`${key}:probe`, String(now), 'PX', this.resetTimeoutMs, 'NX');
      if (probe !== 'OK') throw this.openError(name);
      return;
    }
    const state = this.local.get(name);
    if (!state?.openedAt) return;
    if (now - state.openedAt < this.resetTimeoutMs || state.probing) throw this.openError(name);
    state.probing = true;
  }

  private async recordSuccess(name: string) {
    if (this.redis) {
      await this.redis.del(this.key(name), `${this.key(name)}:probe`);
      return;
    }
    this.local.delete(name);
  }

  private async recordFailure(name: string) {
    const now = Date.now();
    if (this.redis) {
      const key = this.key(name);
      await this.redis.eval(
        `local failures=redis.call('HINCRBY',KEYS[1],'failures',1); if failures>=tonumber(ARGV[1]) then redis.call('HSET',KEYS[1],'openedAt',ARGV[2]) end; redis.call('PEXPIRE',KEYS[1],ARGV[3]); redis.call('DEL',KEYS[2]); return failures`,
        2, key, `${key}:probe`, this.failureThreshold, now, this.resetTimeoutMs * 10,
      );
      return;
    }
    const state = this.local.get(name) || { failures: 0 };
    state.failures += 1;
    state.probing = false;
    if (state.failures >= this.failureThreshold) state.openedAt = now;
    this.local.set(name, state);
  }

  private key(name: string) { return `circuit-breaker:${name}`; }
  private name(value: string) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 80);
    if (!normalized) throw new Error('Circuit breaker dependency name is required');
    return normalized;
  }
  private openError(name: string) { return new ServiceUnavailableException(`${name} dependency circuit is open`); }
  private positiveInteger(name: string, fallback: number) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
    return value;
  }

  async onModuleDestroy() { if (this.redis) await this.redis.quit().catch(() => undefined); }
}
