const { PrismaClient } = require('@prisma/client');

const ROLE_DEFINITIONS = [
  { name: 'wattaman_migration', bypassRls: false },
  { name: 'wattaman_control_plane', bypassRls: true },
  { name: 'wattaman_school_runtime', bypassRls: false },
  { name: 'wattaman_analytics', bypassRls: false },
];
const ROLE_LOCK_ID = 864_220_262;
const RUNTIME_TENANT_TABLES = [
  'User', 'RefreshToken', 'PasswordResetToken', 'AuditLog', 'AuditCleanupSchedule',
  'SiteSetting', 'Post', 'ExtensionInstallation', 'ExtensionVisibilityGrant',
  'ExtensionAlert', 'ExtensionApiMetric', 'ExtensionMigrationRun',
  'ExtensionPilotFeedback', 'SchoolDomain', 'ExtensionRecord', 'SchoolDailyMetric',
  'SchoolProvisioningJob', 'BackupExport', 'BackupRestoreRequest',
];
const RUNTIME_CATALOG_TABLES = [
  'Extension', 'ExtensionVersion', 'ExtensionPublisher', 'ExtensionPermission',
  'ExtensionDependency', 'ExtensionPaymentSetting',
];

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function tableList(tables) {
  return tables.map(quoteIdentifier).join(', ');
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required to provision database roles');
  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${ROLE_LOCK_ID})::text AS locked`);
      const identity = await transaction.$queryRawUnsafe('SELECT current_database() AS database_name, current_user AS owner_name');
      const database = quoteIdentifier(identity[0].database_name);
      const owner = quoteIdentifier(identity[0].owner_name);

      for (const role of ROLE_DEFINITIONS) {
        await transaction.$executeRawUnsafe(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role.name}') THEN
            CREATE ROLE ${quoteIdentifier(role.name)} NOLOGIN INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION ${role.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS'};
          END IF;
        END $$`);
        await transaction.$executeRawUnsafe(`ALTER ROLE ${quoteIdentifier(role.name)} NOLOGIN INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION ${role.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`);
        await transaction.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${database} TO ${quoteIdentifier(role.name)}`);
        await transaction.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(role.name)}`);
      }

      await transaction.$executeRawUnsafe('GRANT CREATE ON SCHEMA public TO "wattaman_migration"');
      await transaction.$executeRawUnsafe('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "wattaman_migration"');
      await transaction.$executeRawUnsafe('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "wattaman_migration"');
      await transaction.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "wattaman_control_plane"');
      await transaction.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "wattaman_control_plane"');
      await transaction.$executeRawUnsafe('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "wattaman_school_runtime"');
      await transaction.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tableList(RUNTIME_TENANT_TABLES)} TO "wattaman_school_runtime"`);
      await transaction.$executeRawUnsafe(`GRANT SELECT ON TABLE ${tableList(RUNTIME_CATALOG_TABLES)} TO "wattaman_school_runtime"`);
      await transaction.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "wattaman_school_runtime"');
      await transaction.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO "wattaman_analytics"');

      for (const grantor of [owner, '"wattaman_migration"']) {
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "wattaman_migration"`);
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "wattaman_migration"`);
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM "wattaman_school_runtime"`);
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "wattaman_control_plane"`);
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "wattaman_control_plane"`);
        await transaction.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${grantor} IN SCHEMA public GRANT SELECT ON TABLES TO "wattaman_analytics"`);
      }
    }, { timeout: 120_000, maxWait: 30_000 });

    const roles = await prisma.$queryRawUnsafe(`
      SELECT rolname, rolcanlogin, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname
    `, ROLE_DEFINITIONS.map((role) => role.name));
    if (roles.length !== ROLE_DEFINITIONS.length) throw new Error('Database role verification failed');
    console.log(JSON.stringify({ status: 'ok', roles }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
