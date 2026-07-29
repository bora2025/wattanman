/**
 * Reserved subdomain for the Platform tier (marketing site + PLATFORM_ADMIN login).
 * Requests on the PLATFORM_HOST env var resolve to the School row with this
 * subdomain instead of being looked up as a real school — see the conversion
 * plan's Phase 1a (sentinel row) and Phase 2b (TenantHostMiddleware).
 *
 * PLATFORM_ADMIN users belong to this row rather than having a null schoolId,
 * so every tenant-scoped model can keep schoolId NOT NULL uniformly.
 */
export const PLATFORM_SCHOOL_SUBDOMAIN = 'platform';
