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
    create: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN, name: 'Wattaman Platform' },
  });

  const school = await prisma.school.upsert({
    where: { subdomain: SEED_SCHOOL_SUBDOMAIN },
    update: {},
    create: { subdomain: SEED_SCHOOL_SUBDOMAIN, name: 'Wattaman School' },
  });
  const schoolId = school.id;

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

  // Create default departments (per-school)
  const departments = [
    { name: 'Human Resources', nameKh: 'ធនធានមនុស្ស', description: 'HR & personnel management' },
    { name: 'Finance', nameKh: 'ហិរញ្ញវត្ថុ', description: 'Accounting & finance' },
    { name: 'Administration', nameKh: 'រដ្ឋបាល', description: 'Administration & operations' },
    { name: 'Security', nameKh: 'សន្តិសុខ', description: 'Security & safety' },
    { name: 'Academics', nameKh: 'សិក្សា', description: 'Academic affairs' },
    { name: 'IT', nameKh: 'ព័ត៌មានវិទ្យា', description: 'Information technology' },
    { name: 'Maintenance', nameKh: 'ថែទាំ', description: 'Facilities & maintenance' },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { schoolId_name: { schoolId, name: dept.name } },
      update: {},
      create: { ...dept, schoolId },
    });
  }
  console.log('Departments seeded');

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
