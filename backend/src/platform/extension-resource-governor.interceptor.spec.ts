import { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionResourceGovernorInterceptor } from './extension-resource-governor.interceptor';

describe('ExtensionResourceGovernorInterceptor', () => {
  const release = jest.fn().mockResolvedValue(undefined);
  const governor = { enterRequest: jest.fn().mockResolvedValue(release) };
  const interceptor = new ExtensionResourceGovernorInterceptor(governor as any);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ baseUrl: '/extensions', route: { path: '/:extensionKey/resources/:resource' }, params: { extensionKey: 'REWARDS' } }),
    }),
  } as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('reserves before runtime execution and releases after success', async () => {
    const result = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      interceptor.intercept(context, { handle: () => of('ok') }).toPromise(),
    );

    expect(result).toBe('ok');
    expect(governor.enterRequest).toHaveBeenCalledWith('school-a', 'REWARDS');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases after downstream failure', async () => {
    await expect(tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      interceptor.intercept(context, { handle: () => throwError(() => new Error('failed')) }).toPromise(),
    )).rejects.toThrow('failed');

    expect(release).toHaveBeenCalledTimes(1);
  });
});
