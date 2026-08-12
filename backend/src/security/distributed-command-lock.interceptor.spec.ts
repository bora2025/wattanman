import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { DistributedCommandLockInterceptor } from './distributed-command-lock.interceptor';

describe('DistributedCommandLockInterceptor', () => {
  it('scopes an installation command by tenant and route resource', async () => {
    const locks = { run: jest.fn((_resource, operation) => operation()) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('INSTALLATION') };
    const prisma = { extensionInstallation: { findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-a', extensionId: 'extension-1' }) } };
    const interceptor = new DistributedCommandLockInterceptor(locks as any, reflector as unknown as Reflector, prisma as any);
    const request = { school: { id: 'school-a' }, params: { id: 'installation-1' }, headers: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await expect(lastValueFrom(interceptor.intercept(context, handler))).resolves.toEqual({ ok: true });
    expect(locks.run).toHaveBeenCalledWith('school:school-a:extension:extension-1', expect.any(Function));
  });
});
