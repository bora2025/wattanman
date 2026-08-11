import { AuditController } from './audit.controller';
import { decodeDateIdCursor } from '../common/cursor-pagination';

describe('AuditController pagination', () => {
  it('uses keyset pagination and preserves a real filtered total', async () => {
    const rows = [
      { id: 'a2', createdAt: new Date('2026-02-02'), action: 'READ', resource: 'TEST', success: true },
      { id: 'a1', createdAt: new Date('2026-02-01'), action: 'READ', resource: 'TEST', success: true },
    ];
    const prisma = { auditLog: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(12) } };
    const page = await new AuditController(prisma as any).list(undefined, 'READ', undefined, undefined, undefined, undefined, undefined, undefined, undefined, '1');
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(12);
    expect(page.pages).toBe(12);
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual({ createdAt: rows[0].createdAt, id: 'a2' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
  });

  it('has no process-local aggregate cache that can leak between schools', () => {
    const controller = new AuditController({} as any) as any;
    expect(controller.facetsCache).toBeUndefined();
    expect(controller.statsCache).toBeUndefined();
  });
});
