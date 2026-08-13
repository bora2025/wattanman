import { summarizeCapacitySnapshots } from './capacity-limit-collector';

describe('capacity limit collector', () => {
  const snapshot = (overrides: any = {}) => ({
    dependencies: {
      database: { status: 'healthy', totalConnections: 50, maxConnections: 100 },
      redis: { status: 'healthy', memoryUtilizationPct: 40 },
      r2: { status: 'healthy', errorRatePct: 0.2 },
      ...overrides.dependencies,
    },
    queues: overrides.queues || [{ oldestJobAgeMs: 2000, workers: 3 }],
  });

  it('reports worst dependency and worker values across samples', () => {
    expect(summarizeCapacitySnapshots([
      snapshot(),
      snapshot({ dependencies: { database: { status: 'healthy', totalConnections: 80, maxConnections: 100 }, redis: { status: 'healthy', memoryUtilizationPct: 70 }, r2: { status: 'healthy', errorRatePct: 0.5 } }, queues: [{ oldestJobAgeMs: 9000, workers: 1 }] }),
    ])).toEqual({ databasePoolMaxPct: 80, redisMemoryMaxPct: 70, queueOldestJobSeconds: 9, minimumWorkers: 1, r2ErrorRatePct: 0.5 });
  });

  it('fails closed when a dependency is unhealthy', () => {
    expect(() => summarizeCapacitySnapshots([snapshot({ dependencies: { redis: { status: 'unhealthy', memoryUtilizationPct: 40 } } })])).toThrow('Dependency became unhealthy');
  });

  it('requires bounded Redis memory utilization', () => {
    expect(() => summarizeCapacitySnapshots([snapshot({ dependencies: { redis: { status: 'healthy', memoryUtilizationPct: null } } })])).toThrow('Redis memory utilization');
  });
});
