/**
 * Canonical set of per-school togglable modules (Phase 7 of the multi-tenant
 * conversion plan). Deliberately a short list: core functionality every
 * school needs (users, attendance, classes, reports, communication) is never
 * gate-able — only genuinely optional programs a school might not run.
 */
export const SCHOOL_MODULE_KEYS = ['BUS'] as const;

export type SchoolModuleKey = (typeof SCHOOL_MODULE_KEYS)[number];

export const SCHOOL_MODULE_LABELS: Record<SchoolModuleKey, string> = {
  BUS: 'School Bus / Transport',
};

export function isValidModuleKey(key: string): key is SchoolModuleKey {
  return (SCHOOL_MODULE_KEYS as readonly string[]).includes(key);
}
