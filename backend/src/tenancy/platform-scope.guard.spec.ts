import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { tenantContext } from './tenant-context';
import { PlatformScopeGuard } from './platform-scope.guard';

describe('PlatformScopeGuard', () => {
  const guard = new PlatformScopeGuard();

  function context(user?: { role: string }) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as ExecutionContext;
  }

  it('opens unscoped mode only for an authenticated platform admin', () => {
    const store = { schoolId: 'platform-school', mode: 'scoped' as const };
    tenantContext.run(store, () => {
      expect(guard.canActivate(context({ role: 'PLATFORM_ADMIN' }))).toBe(true);
      expect(store.mode).toBe('unscoped');
    });
  });

  it('rejects school roles even when guard ordering is incorrect', () => {
    tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => {
      expect(() => guard.canActivate(context({ role: 'ADMIN' }))).toThrow(ForbiddenException);
    });
  });

  it('rejects a missing tenant context', () => {
    expect(() => guard.canActivate(context({ role: 'PLATFORM_ADMIN' }))).toThrow(ForbiddenException);
  });
});
