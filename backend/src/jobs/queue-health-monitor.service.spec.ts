import { QueueHealthMonitorService } from './queue-health-monitor.service';

describe('QueueHealthMonitorService', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original, QUEUE_MONITORED_NAMES: 'operations', QUEUE_DEPTH_WARNING: '10', QUEUE_DEPTH_CRITICAL: '20', QUEUE_OLDEST_JOB_WARNING_MS: '1000', QUEUE_OLDEST_JOB_CRITICAL_MS: '5000' };
  });
  afterAll(() => { process.env = original; });

  it('raises warning and critical alerts from queue snapshots', async () => {
    const queues = { health: jest.fn().mockResolvedValue({ queue: 'operations', depth: 12, oldestJobAgeMs: 6000 }) };
    const service = new QueueHealthMonitorService(queues as any);
    const result = await service.scan();
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QUEUE_DEPTH_HIGH', severity: 'warning' }),
      expect.objectContaining({ code: 'QUEUE_OLDEST_JOB_HIGH', severity: 'critical' }),
    ]));
  });

  it('fails observably when Redis cannot be scanned', async () => {
    const service = new QueueHealthMonitorService({ health: jest.fn().mockRejectedValue(new Error('Redis unavailable')) } as any);
    const result = await service.scan();
    expect(result.alerts).toEqual([expect.objectContaining({ code: 'QUEUE_SCAN_FAILED', severity: 'critical' })]);
  });
});
