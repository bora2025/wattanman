/**
 * One-off catalog addition — Phase 11: adds STUDENT_PORTAL, TEACHER_PORTAL,
 * PARENT_PORTAL as pickable MODULEs. NOT part of the app runtime; run once,
 * by hand, via ts-node.
 *
 * These three admin-nav "Portal" links were core/never-gated until now —
 * converting them to opt-in modules would silently take them away from
 * every existing school unless backfilled enabled, so this script does
 * both: seed the catalog rows, then backfill every existing non-sentinel
 * school with all three enabled (same reasoning as BUS and LATEX_EDITOR's
 * own backfills).
 *
 * Safe to re-run: AddonDefinition upserts key off `key` (unique); the
 * backfill only creates a SchoolAddon row where one doesn't already exist.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." npx ts-node prisma/seed-portal-modules.ts
 */
import { PrismaClient } from '@prisma/client';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const MODULES: Array<{ key: string; name: string; description: string; category: string }> = [
  { key: 'STUDENT_PORTAL', name: 'Student Portal', description: 'Add, edit, remove, and bulk-import student accounts.', category: 'People' },
  { key: 'TEACHER_PORTAL', name: 'Teacher Portal', description: 'Add, edit, and remove teacher accounts.', category: 'People' },
  { key: 'PARENT_PORTAL', name: 'Parent Portal', description: 'Add, edit, and remove parent accounts.', category: 'People' },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Step 1/2: Seeding ${MODULES.length} MODULE catalog entries...`);
    for (const m of MODULES) {
      const row = await prisma.addonDefinition.upsert({
        where: { key: m.key },
        update: {},
        create: { key: m.key, kind: 'MODULE', name: m.name, description: m.description, category: m.category },
      });
      console.log(`  ${m.key}: ${row.id} (kind=${row.kind})`);
    }

    console.log('Step 2/2: Backfilling enablement for existing schools...');
    const schools = await prisma.school.findMany({
      where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
      select: { id: true, subdomain: true },
    });
    for (const school of schools) {
      for (const m of MODULES) {
        const existing = await prisma.schoolAddon.findUnique({
          where: { schoolId_addonKey: { schoolId: school.id, addonKey: m.key } },
        });
        if (existing) {
          console.log(`  ${school.subdomain} / ${m.key}: already has a row (enabled=${existing.enabled}), left untouched`);
          continue;
        }
        await prisma.schoolAddon.create({
          data: { schoolId: school.id, addonKey: m.key, enabled: true },
        });
        console.log(`  ${school.subdomain} / ${m.key}: created enabled row`);
      }
    }

    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
