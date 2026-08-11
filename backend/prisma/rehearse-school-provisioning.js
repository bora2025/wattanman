const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('crypto');

const COUNT = Number(process.env.SYNTHETIC_SCHOOL_COUNT || 1000);
const BATCH_SIZE = Number(process.env.SYNTHETIC_SCHOOL_BATCH_SIZE || 100);
const PREFIX = (process.env.SYNTHETIC_SCHOOL_PREFIX || 'scale-rehearsal').trim().toLowerCase();
const KEEP_DATA = process.env.SYNTHETIC_SCHOOL_KEEP === 'true';

function assertConfiguration() {
  if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required');
  if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 10_000) throw new Error('SYNTHETIC_SCHOOL_COUNT must be an integer from 1 to 10000');
  if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 500) throw new Error('SYNTHETIC_SCHOOL_BATCH_SIZE must be an integer from 1 to 500');
  if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(PREFIX)) throw new Error('SYNTHETIC_SCHOOL_PREFIX must be a safe 3-31 character slug');
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_SYNTHETIC_PROVISIONING !== PREFIX) {
    throw new Error(`Production rehearsal requires CONFIRM_SYNTHETIC_PROVISIONING=${PREFIX}`);
  }
}

function fixture(index) {
  const suffix = String(index + 1).padStart(5, '0');
  const schoolId = randomUUID();
  return {
    school: { id: schoolId, name: `Synthetic School ${suffix}`, subdomain: `${PREFIX}-${suffix}`, status: 'ACTIVE', storagePrefix: `schools/${schoolId}` },
    user: { id: randomUUID(), schoolId, name: `Synthetic Admin ${suffix}`, email: `admin-${suffix}@${PREFIX}.invalid`, password: createHash('sha256').update(`${PREFIX}:${suffix}`).digest('hex'), role: 'ADMIN' },
    setting: { id: randomUUID(), schoolId },
    job: { id: randomUUID(), schoolId, requestKey: `${PREFIX}:${suffix}`, status: 'COMPLETED', attempts: 1, startedAt: new Date(), completedAt: new Date() },
    domain: { id: randomUUID(), schoolId, hostname: `${PREFIX}-${suffix}.test.invalid`, type: 'MANAGED', status: 'VERIFIED', routingStatus: 'READY', verifiedAt: new Date() },
  };
}

async function removeFixtures(prisma) {
  const schools = await prisma.school.findMany({ where: { subdomain: { startsWith: `${PREFIX}-` } }, select: { id: true } });
  if (!schools.length) return 0;
  await prisma.school.deleteMany({ where: { id: { in: schools.map(({ id }) => id) } } });
  return schools.length;
}

async function main() {
  assertConfiguration();
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_ADMIN_URL } } });
  const startedAt = Date.now();
  try {
    const removedBefore = await removeFixtures(prisma);
    for (let offset = 0; offset < COUNT; offset += BATCH_SIZE) {
      const fixtures = Array.from({ length: Math.min(BATCH_SIZE, COUNT - offset) }, (_, index) => fixture(offset + index));
      await prisma.$transaction([
        prisma.school.createMany({ data: fixtures.map(({ school }) => school) }),
        prisma.user.createMany({ data: fixtures.map(({ user }) => user) }),
        prisma.siteSetting.createMany({ data: fixtures.map(({ setting }) => setting) }),
        prisma.schoolProvisioningJob.createMany({ data: fixtures.map(({ job }) => job) }),
        prisma.schoolDomain.createMany({ data: fixtures.map(({ domain }) => domain) }),
      ]);
    }

    const schoolWhere = { subdomain: { startsWith: `${PREFIX}-` } };
    const [schools, admins, settings, jobs, domains, installations] = await Promise.all([
      prisma.school.count({ where: schoolWhere }),
      prisma.user.count({ where: { school: schoolWhere, role: 'ADMIN' } }),
      prisma.siteSetting.count({ where: { school: schoolWhere } }),
      prisma.schoolProvisioningJob.count({ where: { school: schoolWhere, status: 'COMPLETED' } }),
      prisma.schoolDomain.count({ where: { school: schoolWhere, status: 'VERIFIED', routingStatus: 'READY' } }),
      prisma.extensionInstallation.count({ where: { school: schoolWhere } }),
    ]);
    const observed = { schools, admins, settings, jobs, domains, installations };
    if ([schools, admins, settings, jobs, domains].some((value) => value !== COUNT) || installations !== 0) {
      throw new Error(`Provisioning rehearsal verification failed: ${JSON.stringify(observed)}`);
    }
    const result = { status: 'ok', count: COUNT, batchSize: BATCH_SIZE, prefix: PREFIX, removedBefore, durationMs: Date.now() - startedAt, observed };
    if (!KEEP_DATA) result.removedAfter = await removeFixtures(prisma);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
