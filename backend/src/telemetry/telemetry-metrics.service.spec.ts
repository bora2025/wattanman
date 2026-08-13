import { TelemetryMetricsService } from './telemetry-metrics.service';

describe('TelemetryMetricsService', () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => { delete process.env.REDIS_URL; });
  afterAll(() => { if (originalRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalRedis; });

  it('aggregates RED signals and process saturation without Redis', async () => {
    const service = new TelemetryMetricsService();
    const finishSuccess = service.begin();
    const finishFailure = service.begin();
    await finishSuccess(200, 42);
    await finishFailure(503, 260);

    const result = await service.summary(60);

    expect(result).toEqual(expect.objectContaining({ requests: 2, errors: 1, errorRate: 50, availability: 50, averageLatencyMs: 151, p95LatencyMs: 500, maxLatencyMs: 260 }));
    expect(result.saturation).toEqual(expect.objectContaining({ inFlight: 0, peakInFlight: 2, heapUsedBytes: expect.any(Number) }));
  });

  it('finishes each request only once', async () => {
    const service = new TelemetryMetricsService();
    const finish = service.begin();
    await finish(200, 10);
    await finish(500, 1000);
    expect((await service.summary()).requests).toBe(1);
  });
});
