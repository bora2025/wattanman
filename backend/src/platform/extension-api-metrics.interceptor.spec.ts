import { of, throwError } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionApiMetricsInterceptor } from './extension-api-metrics.interceptor';

describe('ExtensionApiMetricsInterceptor', () => {
  const metrics = { record: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new ExtensionApiMetricsInterceptor(metrics as any);
  const context = (path: string, statusCode = 200) => ({
    switchToHttp: () => ({
      getRequest: () => ({ baseUrl: '/extensions', route: { path }, method: 'GET' }),
      getResponse: () => ({ statusCode }),
    }),
  }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('captures successful extension API latency for the current school', async () => {
    await tenantContext.run({ schoolId: 'school-1', mode: 'scoped' }, () => new Promise<void>((resolve, reject) => {
      interceptor.intercept(context('/directory'), { handle: () => of([]) } as any).subscribe({ complete: resolve, error: reject });
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(metrics.record).toHaveBeenCalledWith('/extensions/directory', 'GET', 200, expect.any(Number), 'school-1');
  });

  it('captures failed extension API requests', async () => {
    await new Promise<void>((resolve) => {
      interceptor.intercept(context('/:id'), { handle: () => throwError(() => ({ status: 403 })) } as any)
        .subscribe({ error: () => resolve() });
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(metrics.record).toHaveBeenCalledWith('/extensions/:id', 'GET', 403, expect.any(Number), 'PLATFORM');
  });

  it('ignores unrelated APIs', () => {
    const unrelated = { switchToHttp: () => ({ getRequest: () => ({ baseUrl: '/students', route: { path: '/' } }), getResponse: () => ({}) }) } as any;
    interceptor.intercept(unrelated, { handle: () => of([]) } as any).subscribe();
    expect(metrics.record).not.toHaveBeenCalled();
  });
});
