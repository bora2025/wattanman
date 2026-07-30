/**
 * One-off catalog addition — Phase 12: adds TIMETABLE, PART_TIME_TEACHER,
 * CHAT as pickable MODULEs. NOT part of the app runtime; run once, by
 * hand, via ts-node.
 *
 * TIMETABLE and PART_TIME_TEACHER were both previously bundled under the
 * CLASSES module; CHAT (the admin Communication Hub) was core/never-gated.
 * Converting them to opt-in modules would silently take them away from
 * every existing school unless backfilled enabled, so this script does
 * both: seed the catalog rows, then backfill every existing non-sentinel
 * school with all three enabled (same reasoning as every prior module
 * backfill this project).
 *
 * Safe to re-run: AddonDefinition upserts key off `key` (unique); the
 * backfill only creates a SchoolAddon row where one doesn't already exist.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." npx ts-node prisma/seed-timetable-chat-modules.ts
 */
import { PrismaClient } from '@prisma/client';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const MODULES: Array<{ key: string; name: string; description: string; category: string }> = [
  { key: 'TIMETABLE', name: 'Timetable', description: 'Build and manage the weekly class schedule — subjects, classrooms, lessons, and entries.', category: 'Academics' },
  { key: 'PART_TIME_TEACHER', name: 'Part-Time Teacher & Reports', description: 'Manage the roster of scheduled/part-time teachers and their attendance reports.', category: 'People' },
  { key: 'CHAT', name: 'Communication Hub', description: 'Admin messaging and announcement moderation dashboard.', category: 'Communication' },
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
