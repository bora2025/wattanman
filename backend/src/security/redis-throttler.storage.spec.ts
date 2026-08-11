import { RedisThrottlerStorage } from './redis-throttler.storage';
import { distributedRateLimitOptions } from './rate-limit.config';

describe('distributed rate limiting', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, NODE_ENV: 'test', REDIS_URL: '' }; });
  afterAll(() => { process.env = original; });

  it('blocks atomically-shaped counters after the configured limit', async () => {
    const storage = new RedisThrottlerStorage();
    expect((await storage.increment('client', 1000, 2, 5000, 'ip')).isBlocked).toBe(false);
    expect((await storage.increment('client', 1000, 2, 5000, 'ip')).isBlocked).toBe(false);
    const blocked = await storage.increment('client', 1000, 2, 5000, 'ip');
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('configures IP, user, school, extension, and sensitive dimensions', () => {
    const options = distributedRateLimitOptions() as any;
    expect(options.throttlers.map((item: any) => item.name)).toEqual(['ip', 'user', 'school', 'extension', 'sensitive']);
    expect(options.storage).toBeInstanceOf(RedisThrottlerStorage);
  });

  it('refuses production without TLS Redis', () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://insecure';
    expect(() => new RedisThrottlerStorage()).toThrow('must use TLS');
  });
});
