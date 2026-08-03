import { ExtensionApiMetricsService } from './extension-api-metrics.service';

describe('ExtensionApiMetricsService', () => {
  const prisma = { $executeRaw: jest.fn(), extensionApiMetric: { findMany: jest.fn() } };
  const service = new ExtensionApiMetricsService(prisma as any);

  it('records extension request metrics atomically', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await service.record('/extensions/:id', 'GET', 404, 12, 'school-1');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('calculates error and latency summaries', async () => {
    prisma.extensionApiMetric.findMany.mockResolvedValue([
      { requestCount: 4, errorCount: 1, totalDurationMs: 100, maxDurationMs: 60 },
      { requestCount: 6, errorCount: 0, totalDurationMs: 200, maxDurationMs: 80 },
    ]);
    await expect(service.summary()).resolves.toEqual(expect.objectContaining({
      requests: 10, errors: 1, errorRate: 10, averageDurationMs: 30, maxDurationMs: 80,
    }));
  });
});
