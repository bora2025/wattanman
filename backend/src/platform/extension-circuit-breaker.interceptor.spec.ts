import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionCircuitBreakerInterceptor } from './extension-circuit-breaker.interceptor';

describe('ExtensionCircuitBreakerInterceptor', () => {
  const circuit = { execute: jest.fn() };
  const prisma = { extension: { findUnique: jest.fn() }, extensionAlert: { upsert: jest.fn() } };
  const interceptor = new ExtensionCircuitBreakerInterceptor(circuit as any, prisma as any);
  const context = { switchToHttp: () => ({ getRequest: () => ({ baseUrl: '/extensions', route: { path: '/:extensionKey/pages/:pageKey' }, params: { extensionKey: 'REWARDS' } }) }) } as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    circuit.execute.mockImplementation((_name, operation) => operation());
    prisma.extension.findUnique.mockResolvedValue({ id: 'extension-1' });
    prisma.extensionAlert.upsert.mockResolvedValue({});
  });

  it('isolates runtime calls through an extension-specific circuit', async () => {
    await expect(interceptor.intercept(context, { handle: () => of('ok') }).toPromise()).resolves.toBe('ok');
    expect(circuit.execute).toHaveBeenCalledWith('extension-runtime-rewards', expect.any(Function), expect.any(Function));
    const counts = circuit.execute.mock.calls[0][2];
    expect(counts({ status: 400 })).toBe(false);
    expect(counts({ status: 500 })).toBe(true);
  });

  it('raises a critical alert when the circuit is open', async () => {
    circuit.execute.mockRejectedValue(new ServiceUnavailableException('extension-runtime-rewards dependency circuit is open'));
    await expect(tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => interceptor.intercept(context, { handle: () => throwError(() => new Error('unused')) }).toPromise()))
      .rejects.toThrow('circuit is open');
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.extensionAlert.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: 'RUNTIME_CIRCUIT_OPEN', schoolId: 'school-a' }) }));
  });
});
