const { spawnSync } = require('child_process');
const { readdirSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const prismaCli = join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const schemaPath = join(__dirname, 'schema.prisma');
const migrationsPath = join(__dirname, 'migrations');

function run(args, acceptedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (!acceptedExitCodes.includes(result.status)) process.exit(result.status || 1);
  return result.status;
}

function capture(args, acceptedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], { encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!acceptedExitCodes.includes(result.status)) process.exit(result.status || 1);
  return { status: result.status, stdout: result.stdout || '' };
}

function migrationNames() {
  return readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function tables() {
  return prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
}

async function migrationCount() {
  const exists = await prisma.$queryRawUnsafe(`SELECT to_regclass('"_prisma_migrations"')::text AS relation`);
  if (!exists[0].relation) return 0;
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
  return rows[0].count;
}

async function baselineCurrentSchema(migrations = migrationNames()) {
  for (const migration of migrations) run(['migrate', 'resolve', '--schema', schemaPath, '--applied', migration]);
}

function isOnlyMissingPilotFeedback(sql) {
  const statements = sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  return statements.length > 0 && statements.every((statement) => statement.includes('ExtensionPilotFeedback'));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const existingTables = await tables();
  const appliedMigrations = await migrationCount();

  if (!existingTables.length && !appliedMigrations) {
    console.log('Empty database detected; creating the current schema and recording a migration baseline.');
    run(['db', 'push', '--schema', schemaPath, '--skip-generate']);
    await baselineCurrentSchema();
  } else if (!appliedMigrations) {
    if (!process.argv.includes('--adopt-existing')) {
      throw new Error('Existing database has no Prisma migration history. Back it up, verify it matches prisma/schema.prisma, then rerun with --adopt-existing.');
    }
    const diff = capture(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', schemaPath, '--script', '--exit-code'], [0, 2]);
    if (diff.status === 0) {
      console.log('Existing schema matches Prisma; recording the current migrations as an adopted baseline.');
      await baselineCurrentSchema();
    } else if (isOnlyMissingPilotFeedback(diff.stdout)) {
      const migrations = migrationNames();
      const pendingMigration = '20260803000010_add_extension_pilot_feedback';
      if (migrations[migrations.length - 1] !== pendingMigration) {
        throw new Error('Pilot feedback recovery is not the latest migration; migration history was not modified.');
      }
      console.log('Existing schema predates pilot feedback; adopting prior migrations before deploying the pending migration.');
      await baselineCurrentSchema(migrations.slice(0, -1));
    } else {
      throw new Error('Existing database does not match prisma/schema.prisma; migration history was not modified.');
    }
  }

  run(['migrate', 'deploy', '--schema', schemaPath]);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
