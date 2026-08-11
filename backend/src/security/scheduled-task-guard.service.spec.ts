import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ScheduledTaskGuardService } from './scheduled-task-guard.service';

describe('ScheduledTaskGuardService', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, NODE_ENV: 'test', REDIS_URL: '' }; });
  afterAll(() => { process.env = original; });

  it('allows only one replica claim per task time bucket', async () => {
    const guard = new ScheduledTaskGuardService();
    await expect(guard.acquire('hourly-rollup', 60_000, 120_000)).resolves.toBe(true);
    await expect(guard.acquire('hourly-rollup', 60_000, 120_500)).resolves.toBe(false);
    await expect(guard.acquire('hourly-rollup', 60_000, 180_000)).resolves.toBe(true);
  });

  it('allows only one winner across independent replicas sharing Redis', async () => {
    const claims = new Set<string>();
    const redis = {
      set: jest.fn(async (key: string) => {
        if (claims.has(key)) return null;
        claims.add(key);
        return 'OK';
      }),
    };
    const replicaA = new ScheduledTaskGuardService();
    const replicaB = new ScheduledTaskGuardService();
    (replicaA as any).redis = redis;
    (replicaB as any).redis = redis;

    const winners = await Promise.all([
      replicaA.acquire('extension-updates', 60_000, 120_000),
      replicaB.acquire('extension-updates', 60_000, 120_000),
    ]);

    expect(winners.sort()).toEqual([false, true]);
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('requires every cron implementation to claim a distributed bucket', () => {
    const scheduled = [
      ['audit/audit.service.ts', "schedules.acquire('audit-cleanup'"],
      ['school-metrics/school-metrics.service.ts', "schedules.acquire('school-metrics-rollup'"],
      ['platform/extension-cleanup.service.ts', "schedules.acquire('extension-cleanup'"],
      ['platform/extension-update.service.ts', "schedules.acquire('extension-updates'"],
      ['platform/extension-alert.service.ts', "schedules.acquire('extension-alert-scan'"],
      ['jobs/queue-health-monitor.service.ts', "schedules.acquire('queue-health-scan'"],
    ];
    for (const [file, claim] of scheduled) {
      const source = readFileSync(resolve(process.cwd(), 'src', file), 'utf8');
      expect(source).toContain('@Cron(');
      expect(source).toContain(claim);
    }
  });
});
