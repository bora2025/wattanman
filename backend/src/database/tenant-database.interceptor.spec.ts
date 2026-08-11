import { CallHandler } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { TenantDatabaseInterceptor } from './tenant-database.interceptor';

describe('TenantDatabaseInterceptor', () => {
  const prisma = { runInTenantTransaction: jest.fn((_schoolId, callback) => callback()) };
  const interceptor = new TenantDatabaseInterceptor(prisma as any);
  const next: CallHandler = { handle: () => of({ ok: true }) };

  beforeEach(() => jest.clearAllMocks());

  it('opens a database transaction for scoped school requests', async () => {
    const result = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      lastValueFrom(interceptor.intercept({} as any, next)),
    );
    expect(result).toEqual({ ok: true });
    expect(prisma.runInTenantTransaction).toHaveBeenCalledWith('school-a', expect.any(Function));
  });

  it('does not route audited platform scope through the school runtime transaction', async () => {
    await tenantContext.run({ schoolId: 'platform', mode: 'unscoped' }, () =>
      lastValueFrom(interceptor.intercept({} as any, next)),
    );
    expect(prisma.runInTenantTransaction).not.toHaveBeenCalled();
  });
});
