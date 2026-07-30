/**
 * One-off catalog seed — Phase 9 of the multi-tenant conversion plan
 * (Unified Modules & Add-ons Catalog). NOT part of the app runtime; run
 * once, by hand, via ts-node, after `db push` has applied
 * `AddonDefinition.kind` and dropped `School.disabledModules`.
 *
 * What it does:
 *   1. Upserts one AddonDefinition (kind: "MODULE") per free module key
 *      that now has a @RequiresAddon() guard on its controller(s) —
 *      ATTENDANCE, CLASSES, FEES, SALARY, EXAMS, CARD_DESIGNER, and BUS
 *      (BUS was gated back in Phase 7/9's bus.controller.ts change but
 *      never had a matching catalog row — the old disabledModules system
 *      didn't need one).
 *   2. Backfills every existing non-sentinel School with an enabled
 *      SchoolAddon(addonKey: "BUS") row, since every school today has Bus
 *      access under the old opt-out default and the user's confirmed
 *      requirement was "no disruption to existing schools" when moving to
 *      opt-in. Other modules are deliberately NOT backfilled — Attendance,
 *      Classes, Fees, etc. are newly gate-able starting now, and retroactively
 *      enabling them for existing schools would be a product decision, not
 *      this script's call (existing schools keep working today because
 *      those controllers had no guard until this same deploy adds one AND
 *      this script runs — see ROLLOUT ordering note at the bottom).
 *
 * Safe to re-run: AddonDefinition upserts key off `key` (unique); the BUS
 * backfill only creates a SchoolAddon row where one doesn't already exist
 * for that (schoolId, addonKey) pair.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." \
 *   BUS_ALREADY_DISABLED_SUBDOMAINS="schoolnamenumber3-app" \
 *   npx ts-node prisma/seed-modules.ts
 *
 * BUS_ALREADY_DISABLED_SUBDOMAINS: comma-separated school subdomains to skip
 * in the BUS backfill — for any school that had explicitly opted OUT of Bus
 * under the old disabledModules array (checked by hand against production
 * before this schema migration dropped that column; see the Phase 9 plan
 * status notes for the snapshot this was taken from). Skipping preserves
 * that school's actual choice instead of silently re-enabling Bus for them.
 */
import { PrismaClient } from '@prisma/client';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const BUS_SKIP_SUBDOMAINS = new Set(
  (process.env.BUS_ALREADY_DISABLED_SUBDOMAINS || '').split(',').map(s => s.trim()).filter(Boolean),
);

const MODULES: Array<{ key: string; name: string; description: string; category: string }> = [
  { key: 'ATTENDANCE', name: 'Attendance', description: 'Camera/QR gate scanning, manual attendance edits, staff attendance.', category: 'Academics' },
  { key: 'CLASSES', name: 'Class Management', description: 'Classes, study years, and timetable.', category: 'Academics' },
  { key: 'FEES', name: 'Fee Management', description: 'Student fee records, payments, and the finance/budget dashboard.', category: 'Finance' },
  { key: 'SALARY', name: 'Salary Management', description: 'Staff salary records and payment tracking.', category: 'Finance' },
  { key: 'EXAMS', name: 'Exams & Scoring', description: 'Exams, score sheets, and grading.', category: 'Academics' },
  { key: 'CARD_DESIGNER', name: 'ID Card Designer', description: 'Design and print student/staff ID card and certificate templates.', category: 'Tools' },
  { key: 'BUS', name: 'School Bus', description: 'Bus routes, stops, and live location tracking.', category: 'Transport' },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Step 1/2: Seeding ${MODULES.length} MODULE catalog entries...`);
    for (const m of MODULES) {
      const row = await prisma.addonDefinition.upsert({
        where: { key: m.key },
        update: {}, // don't clobber platform-admin edits (name/description/isActive) on re-run
        create: { key: m.key, kind: 'MODULE', name: m.name, description: m.description, category: m.category },
      });
      console.log(`  ${m.key}: ${row.id} (kind=${row.kind})`);
    }

    console.log('Step 2/2: Backfilling BUS enablement for existing schools...');
    const schools = await prisma.school.findMany({
      where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
      select: { id: true, name: true, subdomain: true },
    });
    for (const school of schools) {
      if (BUS_SKIP_SUBDOMAINS.has(school.subdomain)) {
        console.log(`  ${school.subdomain}: had BUS explicitly disabled pre-migration, skipping (stays absent = disabled under opt-in)`);
        continue;
      }
      const existing = await prisma.schoolAddon.findUnique({
        where: { schoolId_addonKey: { schoolId: school.id, addonKey: 'BUS' } },
      });
      if (existing) {
        console.log(`  ${school.subdomain}: already has a BUS row (enabled=${existing.enabled}), left untouched`);
        continue;
      }
      await prisma.schoolAddon.create({
        data: { schoolId: school.id, addonKey: 'BUS', enabled: true },
      });
      console.log(`  ${school.subdomain}: created enabled BUS row`);
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
