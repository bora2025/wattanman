/**
 * Every Prisma model name that carries a `schoolId` column, i.e. every model in
 * schema.prisma except `School` itself. Used by PrismaService's tenant-scoping
 * middleware (backend/src/database/prisma.service.ts) to decide which queries to
 * auto-scope. Keep this in sync with schema.prisma — if a new tenant-scoped model
 * is added there, add it here too, or its queries will silently run unscoped.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'User',
  'RefreshToken',
  'PasswordResetToken',
  'AuditLog',
  'AuditCleanupSchedule',
  'SiteSetting',
  'Post',
  'ExtensionInstallation',
  'ExtensionPilotFeedback',
  'SchoolDomain',
  'ExtensionRecord',
  'SchoolDailyMetric',
  'SchoolProvisioningJob',
]);
