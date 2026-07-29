import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request tenant context. `mode: 'unscoped'` is only ever set by
 * PlatformScopeGuard (see ./platform-scope.guard.ts), used exclusively inside
 * backend/src/platform/* controllers — nowhere else in the codebase is permitted
 * to request it. This is the actual safety property of the whole tenancy design:
 * a bug anywhere in the other ~30 modules can at worst touch the wrong single
 * school, never every school at once.
 */
export interface TenantStore {
  schoolId: string;
  mode: 'scoped' | 'unscoped';
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** Throws if called outside a request that went through TenantHostMiddleware. */
export function getTenantStore(): TenantStore {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      'No tenant context found — TenantHostMiddleware must run before this code path (are you calling this outside an HTTP request?).',
    );
  }
  return store;
}

export function getCurrentSchoolId(): string {
  return getTenantStore().schoolId;
}
