const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Must match backend/src/tenancy/constants.ts (kept inline here since this script
// runs via plain `node`, not ts-node, and can't import a .ts file directly).
const PLATFORM_SCHOOL_SUBDOMAIN = 'platform';

// Subdomain for the school this bootstrap seed creates. Override via env var when
// running against a specific school's fresh install; defaults to a placeholder.
// NOTE: this is a fresh-install bootstrap, not the production cutover — migrating
// the *existing* single-tenant production data into its real school row is a
// separate, one-off backfill script (see the conversion plan's Phase 8).
const SEED_SCHOOL_SUBDOMAIN = process.env.SEED_SCHOOL_SUBDOMAIN || 'default';

async function seed() {
  // Platform sentinel row — see backend/src/tenancy/constants.ts.
  await prisma.school.upsert({
    where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN },
    update: {},
    create: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN, name: 'Wattaman Platform', storagePrefix: 'schools/platform' },
  });

  const school = await prisma.school.upsert({
    where: { subdomain: SEED_SCHOOL_SUBDOMAIN },
    update: {},
    create: { subdomain: SEED_SCHOOL_SUBDOMAIN, name: 'Wattaman School', storagePrefix: `schools/${SEED_SCHOOL_SUBDOMAIN}` },
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

  const publisher = await prisma.extensionPublisher.upsert({
    where: { key: 'WATTAMAN' },
    update: {},
    create: { key: 'WATTAMAN', name: 'Wattaman', status: 'ACTIVE', internal: true },
  });
  const platformAdmins = await prisma.user.findMany({
    where: { role: 'PLATFORM_ADMIN' },
    select: { id: true },
  });
  for (const platformAdmin of platformAdmins) {
    await prisma.extensionPublisherMember.upsert({
      where: { publisherId_userId: { publisherId: publisher.id, userId: platformAdmin.id } },
      update: { roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
      create: {
        publisherId: publisher.id,
        userId: platformAdmin.id,
        roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'],
        status: 'ACTIVE',
      },
    });
  }
  console.log(`Publisher access synchronized for ${platformAdmins.length} platform administrator(s)`);

  // Only seed the admin if no admin user exists for this school
  const existing = await prisma.user.findUnique({ where: { schoolId_email: { schoolId, email: 'admin@gmail.com' } } });
  if (existing) {
    console.log('Admin user already exists, skipping seed');
    return;
  }

  const admin = await prisma.user.create({
    data: {
      schoolId,
      email: 'admin@gmail.com',
      password: await bcrypt.hash('Abc2026m3', 10),
      name: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log('Admin user created:', admin.email, 'for school', school.subdomain);
}

seed()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Seed error:', e.message); process.exit(1); });
