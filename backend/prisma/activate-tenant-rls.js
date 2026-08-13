const { PrismaClient } = require('@prisma/client');

const TENANT_TABLES = [
  'User', 'RefreshToken', 'PasswordResetToken', 'AuditLog',
  'AuditCleanupSchedule', 'SiteSetting', 'Post', 'ExtensionInstallation',
  'ExtensionVisibilityGrant', 'ExtensionAlert', 'ExtensionApiMetric',
  'ExtensionMigrationRun', 'ExtensionPilotFeedback', 'SchoolDomain',
  'ExtensionRecord', 'ExtensionPaymentEvidence', 'ExtensionLifecycleJob', 'ExtensionPurgeReport', 'SchoolDailyMetric', 'SchoolProvisioningJob', 'BackupExport', 'BackupRestoreRequest',
];
const RLS_LOCK_ID = 864_220_263;

function client(url, label) {
  if (!url?.trim()) throw new Error(`${label} is required for RLS activation`);
  return new PrismaClient({ datasources: { db: { url: url.trim() } } });
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function verifyIdentity(prisma, expectedRole, expectedBypass) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT current_user AS role_name, rolbypassrls AS bypass_rls
    FROM pg_roles WHERE rolname = current_user
  `);
  const identity = rows[0];
  if (identity?.role_name !== expectedRole || identity?.bypass_rls !== expectedBypass) {
    throw new Error(`Expected ${expectedRole} with BYPASSRLS=${expectedBypass}; connection assumed ${identity?.role_name || 'unknown'} with BYPASSRLS=${identity?.bypass_rls}`);
  }
}

async function main() {
  const admin = client(process.env.DATABASE_ADMIN_URL, 'DATABASE_ADMIN_URL');
  const runtime = client(process.env.RLS_RUNTIME_DATABASE_URL, 'RLS_RUNTIME_DATABASE_URL');
  const control = client(process.env.RLS_CONTROL_PLANE_DATABASE_URL, 'RLS_CONTROL_PLANE_DATABASE_URL');
  try {
    await verifyIdentity(runtime, 'wattaman_school_runtime', false);
    await verifyIdentity(control, 'wattaman_control_plane', true);
    await admin.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(`DO $$ BEGIN PERFORM pg_advisory_xact_lock(${RLS_LOCK_ID}); END $$`);
      for (const table of TENANT_TABLES) {
        const identifier = quoteIdentifier(table);
        await transaction.$executeRawUnsafe(`ALTER TABLE ${identifier} ENABLE ROW LEVEL SECURITY`);
        await transaction.$executeRawUnsafe(`ALTER TABLE ${identifier} FORCE ROW LEVEL SECURITY`);
      }
    }, { timeout: 120_000, maxWait: 30_000 });

    const state = await admin.$queryRawUnsafe(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'tenant_school_isolation') AS has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, TENANT_TABLES);
    if (state.length !== TENANT_TABLES.length || state.some((table) => !table.relrowsecurity || !table.relforcerowsecurity || !table.has_policy)) {
      throw new Error('RLS activation verification failed');
    }
    console.log(JSON.stringify({ status: 'ok', tables: state }, null, 2));
  } finally {
    await Promise.all([admin.$disconnect(), runtime.$disconnect(), control.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
