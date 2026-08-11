const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const prismaCli = join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const schemaPath = join(__dirname, 'schema.prisma');
const RELEASE_LOCK_ID = 864_220_261;
const LEGACY_BASELINE = '20260728000000_legacy_schema_baseline';
const legacyBaselinePath = join(__dirname, 'migrations', LEGACY_BASELINE, 'migration.sql');

function prismaCommand(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--schema', schemaPath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma command failed with exit code ${result.status || 1}: ${args.join(' ')}`);
}

async function resolveHistoricalBaseline(transaction) {
  const state = await transaction.$queryRawUnsafe(`
    SELECT
      to_regclass('"User"')::text AS user_table,
      to_regclass('"_prisma_migrations"')::text AS history_table
  `);
  if (!state[0]?.user_table || !state[0]?.history_table) return;
  const rows = await transaction.$queryRawUnsafe(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `);
  const applied = new Set(rows.map((row) => row.migration_name));
  if (!applied.size || applied.has(LEGACY_BASELINE)) return;
  console.log(`Adopting historical fresh-install baseline ${LEGACY_BASELINE} for an already-migrated database.`);
  prismaCommand(['migrate', 'resolve', '--applied', LEGACY_BASELINE]);
}

async function synchronizeHistoricalBaselineChecksum(transaction) {
  const checksum = createHash('sha256').update(readFileSync(legacyBaselinePath)).digest('hex');
  const changed = await transaction.$executeRawUnsafe(`
    UPDATE "_prisma_migrations"
    SET checksum = $1
    WHERE migration_name = $2
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
      AND checksum <> $1
  `, checksum, LEGACY_BASELINE);
  if (changed) console.log(`Synchronized checksum for synthetic baseline ${LEGACY_BASELINE}.`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${RELEASE_LOCK_ID})`);
    console.log(`Acquired migration advisory lock ${RELEASE_LOCK_ID}.`);
    await resolveHistoricalBaseline(transaction);
    await synchronizeHistoricalBaselineChecksum(transaction);
    prismaCommand(['migrate', 'deploy']);
  }, { timeout: 900_000, maxWait: 60_000 });
  console.log('Release migrations completed.');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
