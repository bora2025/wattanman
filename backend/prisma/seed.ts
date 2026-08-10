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
    create: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN, name: 'Wattaman Platform' },
  });

  // Dev/test school with only the base administrator account.
  const school = await prisma.school.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: { subdomain: 'demo', name: 'Demo School' },
  });
  const schoolId = school.id;

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
