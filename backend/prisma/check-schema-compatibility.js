const { readdirSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function migrationNames() {
  return readdirSync(join(__dirname, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const historyTable = await prisma.$queryRawUnsafe(`SELECT to_regclass('"_prisma_migrations"')::text AS relation`);
  if (!historyTable[0]?.relation) {
    throw new Error('Database migration history is missing; run the dedicated release migration command before starting the API.');
  }
  const rows = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at, logs
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `);
  const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  if (failed.length) {
    throw new Error(`Database has failed migrations: ${failed.map((row) => row.migration_name).join(', ')}`);
  }
  const applied = new Set(rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const pending = migrationNames().filter((name) => !applied.has(name));
  if (pending.length) {
    throw new Error(`Database is behind this release. Pending migrations: ${pending.join(', ')}`);
  }
  console.log(`Schema compatibility check passed (${applied.size} applied migrations).`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
