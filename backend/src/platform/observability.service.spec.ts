import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('combines API, dependency, queue, worker, school, and extension metrics', async () => {
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ active: 2n, total: 5n, max_connections: 100 }]),
      school: { findMany: jest.fn().mockResolvedValue([{ id: 'school-1', subdomain: 'aurora', extensionDataBytes: 100, extensionDataRecords: 2 }]) },
      extensionInstallation: { findMany: jest.fn().mockResolvedValue([{ id: 'installation-1', schoolId: 'school-1', dataBytes: 100, dataRecords: 2, extension: { id: 'extension-1', key: 'REWARDS', name: 'Rewards' } }]) },
    };
    const prisma = { runInControlPlane: jest.fn((callback) => callback(client)) };
    const queues = { health: jest.fn().mockResolvedValue({ queue: 'extensions', depth: 0, workers: 1 }) };
    const storage = { health: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 4 }) };
    const telemetry = { summary: jest.fn().mockResolvedValue({ requests: 10 }), redisHealth: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }) };
    const original = process.env.QUEUE_MONITORED_NAMES;
    process.env.QUEUE_MONITORED_NAMES = 'extensions';
    try {
      const result = await new ObservabilityService(prisma as any, queues as any, storage as any, telemetry as any).snapshot(30);
      expect(result.api.requests).toBe(10);
      expect(result.dependencies.database).toEqual(expect.objectContaining({ status: 'healthy', activeConnections: 2, totalConnections: 5, maxConnections: 100 }));
      expect(result.queues).toEqual([expect.objectContaining({ queue: 'extensions', workers: 1 })]);
      expect(result.usage.schools[0].subdomain).toBe('aurora');
      expect(result.usage.extensions[0].extension.key).toBe('REWARDS');
    } finally {
      if (original === undefined) delete process.env.QUEUE_MONITORED_NAMES; else process.env.QUEUE_MONITORED_NAMES = original;
    }
  });
});
