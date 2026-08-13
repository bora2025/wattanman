import { PrismaClient } from '@prisma/client';
import { assertLoadTestDatabaseConfiguration, assertSyntheticOnlySchools } from '../load-test/database-safety';

async function main() {
  const databaseUrl = assertLoadTestDatabaseConfiguration({ databaseUrl: process.env.LOAD_TEST_DATABASE_URL, authorization: process.env.LOAD_TEST_DATABASE_AUTHORIZATION, environment: process.env.NODE_ENV });
  if (process.env.LOAD_TEST_CLEANUP_CONFIRMATION !== 'DELETE_ALL_SYNTHETIC_LOAD_DATA') throw new Error('LOAD_TEST_CLEANUP_CONFIRMATION is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$connect();
    const schools = await prisma.school.findMany({ select: { id: true, subdomain: true } });
    assertSyntheticOnlySchools(schools);
    const deletedSchools = await prisma.school.deleteMany({ where: { id: { startsWith: 'load-school-' } } });
    const deletedExtensions = await prisma.extension.deleteMany({ where: { id: { startsWith: 'load-extension-' } } });
    const deletedPublishers = await prisma.extensionPublisher.deleteMany({ where: { id: 'load-publisher', extensions: { none: {} } } });
    const remaining = await prisma.school.count({ where: { id: { startsWith: 'load-school-' } } });
    if (remaining !== 0) throw new Error('Synthetic school cleanup verification failed');
    process.stdout.write(`${JSON.stringify({ outcome: 'CLEANED', schools: deletedSchools.count, extensions: deletedExtensions.count, publishers: deletedPublishers.count, verifiedRemainingSchools: remaining })}\n`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
