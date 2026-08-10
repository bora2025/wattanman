import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const prisma = new PrismaClient();

async function main() {
  // Platform sentinel row — see backend/src/tenancy/constants.ts. Not a real school;
  // exists so PLATFORM_ADMIN users have a non-null schoolId.
  await prisma.school.upsert({
    where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN },
    update: {},
    create: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN, name: 'Wattaman Platform', storagePrefix: 'schools/platform' },
  });

  // Dev/test school with only the base administrator account.
  const school = await prisma.school.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: { subdomain: 'demo', name: 'Demo School', storagePrefix: 'schools/demo' },
  });
  const schoolId = school.id;

  const rootDomain = (process.env.SCHOOL_ROOT_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  const schoolHostname = rootDomain ? `${school.subdomain}.${rootDomain}` : school.subdomain;
  await prisma.schoolDomain.upsert({
    where: { hostname: schoolHostname },
    update: { schoolId },
    create: {
      schoolId,
      hostname: schoolHostname,
      type: rootDomain ? 'MANAGED' : 'LEGACY_ALIAS',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  });

  const deploymentHostname = (process.env.SEED_SCHOOL_HOSTNAME || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (deploymentHostname) {
    await prisma.schoolDomain.upsert({
      where: { hostname: deploymentHostname },
      update: { schoolId, type: 'MANAGED', status: 'VERIFIED', verifiedAt: new Date(), routingStatus: 'READY', routingCheckedAt: new Date(), routingError: null },
      create: {
        schoolId,
        hostname: deploymentHostname,
        type: 'MANAGED',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        routingStatus: 'READY',
        routingCheckedAt: new Date(),
      },
    });
  }

  await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: 'admin@test.com' } },
    update: {},
    create: {
      schoolId,
      email: 'admin@test.com',
      password: await bcrypt.hash('password', 10),
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  console.log('Base school administrator seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
