import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { tenantContext } from './tenant-context';

/**
 * Switches the current request's tenant context to `mode: 'unscoped'`, allowing
 * PrismaService's tenant-scoping middleware to pass queries through untouched.
 *
 * This is the ONLY place in the codebase permitted to do this. Apply it ONLY to
 * backend/src/platform/* controllers, and only after RolesGuard has already
 * confirmed the caller is PLATFORM_ADMIN (guard order matters — this must run
 * after role verification, never before). Reserve unscoped queries for genuine
 * cross-school aggregates (e.g. "how many schools exist"); a Platform-tier
 * "view as school X" feature should set `schoolId: X, mode: 'scoped'` instead of
 * using this guard, so it goes through the same guardrail as everything else,
 * just pointed at a chosen school.
 */
@Injectable()
export class PlatformScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const store = tenantContext.getStore();
    if (store) {
      store.mode = 'unscoped';
    }
    return true;
  }
}
