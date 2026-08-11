import { decodeDateIdCursor } from '../common/cursor-pagination';
import { SchoolMetricsService } from './school-metrics.service';

describe('SchoolMetricsService pagination', () => {
  it('pages schools before loading their daily metrics', async () => {
    const schools = [
      { id: 'school-2', name: 'Two', subdomain: 'two', createdAt: new Date('2026-02-02') },
      { id: 'school-1', name: 'One', subdomain: 'one', createdAt: new Date('2026-02-01') },
    ];
    const prisma = {
      school: { findMany: jest.fn().mockResolvedValue(schools) },
      schoolDailyMetric: { findMany: jest.fn().mockResolvedValue([{ schoolId: 'school-2', requestCount: 4, errorCount: 0, avgDurationMs: 5, p95DurationMs: 8, activeUserCount: 2, storageBytes: 10n }]) },
    };

    const page = await new SchoolMetricsService(prisma as any).listForDate(new Date('2026-02-03'), undefined, '1');

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual(expect.objectContaining({ schoolId: 'school-2', requestCount: 4, storageBytes: 10 }));
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual({ id: 'school-2', createdAt: schools[0].createdAt });
    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(prisma.schoolDailyMetric.findMany).toHaveBeenCalledWith({ where: { date: new Date('2026-02-03'), schoolId: { in: ['school-2'] } } });
  });

  it('computes storage only from retained core and extension tables', async () => {
    let query = '';
    const prisma = {
      $queryRaw: jest.fn((parts: TemplateStringsArray) => {
        query = parts.join('?');
        return [{ bytes: 42n }];
      }),
    };

    const bytes = await (new SchoolMetricsService(prisma as any) as any).computeStorageBytes('school-1');

    expect(bytes).toBe(42n);
    expect(query).toContain('"ExtensionRecord"');
    for (const removed of ['"Student"', '"Class"', '"Course"', '"CardTemplate"']) expect(query).not.toContain(removed);
  });
});
