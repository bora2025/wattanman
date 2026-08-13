import { lastValueFrom, of } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { RequestTelemetryInterceptor } from './request-telemetry.interceptor';
import { telemetryContext } from './telemetry-context';

describe('RequestTelemetryInterceptor', () => {
  it('supports health routes that intentionally bypass tenant resolution', async () => {
    const response = { statusCode: 200, setHeader: jest.fn() };
    const context = { switchToHttp: () => ({ getRequest: () => ({ method: 'GET', path: '/ready', route: { path: '/ready' }, headers: {}, params: {} }), getResponse: () => response }) };

    await expect(lastValueFrom(new RequestTelemetryInterceptor().intercept(context as any, { handle: () => of({ status: 'ready' }) })))
      .resolves.toEqual({ status: 'ready' });
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
  });

  it('accepts bounded IDs, returns them, and exposes dimensions downstream', async () => {
    const headers: Record<string, string> = {};
    const request = {
      method: 'GET', path: '/extensions/EXT/page', route: { path: '/extensions/:extensionId/:versionId' },
      headers: { 'x-request-id': 'request-1', 'x-trace-id': 'trace-1' },
      params: { extensionId: 'extension-1', versionId: 'version-1', id: 'installation-1' },
      user: { userId: 'user-1' },
    };
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value; } }) }) };
    let observed;

    await tenantContext.run({ schoolId: 'school-1', mode: 'scoped' }, () => lastValueFrom(
      new RequestTelemetryInterceptor().intercept(context as any, { handle: () => of(observed = telemetryContext.current()) }),
    ));

    expect(headers).toEqual({ 'x-request-id': 'request-1', 'x-trace-id': 'trace-1' });
    expect(observed).toEqual(expect.objectContaining({ requestId: 'request-1', traceId: 'trace-1', schoolId: 'school-1', userId: 'user-1', extensionId: 'extension-1', versionId: 'version-1', installationId: 'installation-1' }));
  });
});
