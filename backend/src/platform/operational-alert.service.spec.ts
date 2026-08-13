import { OperationalAlertService } from './operational-alert.service';

describe('OperationalAlertService', () => {
  const schedules = { acquire: jest.fn().mockResolvedValue(true) };

  it('routes severe API, dependency, and worker failures to paging', () => {
    const service = new OperationalAlertService({} as any, {} as any, schedules as any);
    const candidates = service.evaluate({
      api: { requests: 1000, availability: 98.5, p95LatencyMs: 3000, errorRate: 1.5, windowMinutes: 15 },
      dependencies: { database: { status: 'unhealthy', latencyMs: 1000 }, redis: { status: 'healthy' } },
      queues: [{ queue: 'extensions', depth: 10, oldestJobAgeMs: 1000, workers: 0, counts: { failed: 0 } }],
    });
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ fingerprint: 'API_SLO:PLATFORM', route: 'PAGE', severity: 'CRITICAL' }),
      expect.objectContaining({ fingerprint: 'DEPENDENCY_HEALTH:DATABASE', route: 'PAGE' }),
      expect.objectContaining({ fingerprint: 'QUEUE_HEALTH:EXTENSIONS', route: 'PAGE' }),
    ]));
  });

  it('creates tickets for warning thresholds and ignores low-volume API noise', () => {
    const service = new OperationalAlertService({} as any, {} as any, schedules as any);
    const candidates = service.evaluate({
      api: { requests: 20, availability: 90, p95LatencyMs: 5000, errorRate: 10, windowMinutes: 15 },
      dependencies: {},
      queues: [{ queue: 'operations', depth: 600, oldestJobAgeMs: 1000, workers: 1, counts: { failed: 0 } }],
    });
    expect(candidates).toEqual([expect.objectContaining({ fingerprint: 'QUEUE_HEALTH:OPERATIONS', route: 'TICKET', severity: 'WARNING' })]);
  });

  it('persists, dispatches new alerts, and resolves recovered conditions', async () => {
    const observability = { snapshot: jest.fn().mockResolvedValue({ api: { requests: 0 }, dependencies: { r2: { status: 'unhealthy', latencyMs: 10 } }, queues: [] }) };
    const alerts = { raiseOperational: jest.fn().mockResolvedValue({ alert: { id: 'alert-1' }, notify: true }), resolveRecoveredOperational: jest.fn().mockResolvedValue({ count: 0 }) };
    const service = new OperationalAlertService(observability as any, alerts as any, schedules as any);
    const dispatch = jest.spyOn(service as any, 'dispatch').mockResolvedValue(undefined);

    const result = await service.scan();

    expect(result).toEqual({ raised: 1, paged: 1, ticketed: 0 });
    expect(dispatch).toHaveBeenCalledWith('PAGE', expect.objectContaining({ fingerprint: 'DEPENDENCY_HEALTH:R2' }));
    expect(alerts.resolveRecoveredOperational).toHaveBeenCalledWith(['DEPENDENCY_HEALTH:R2']);
  });
});
