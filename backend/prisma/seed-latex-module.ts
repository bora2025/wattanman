/**
 * One-off catalog addition — adds LATEX_EDITOR as a pickable MODULE.
 * NOT part of the app runtime; run once, by hand, via ts-node.
 *
 * LaTeX Editor (/tools/latex-editor) is purely client-side — no backend
 * controller calls it, so there's nothing to @RequiresAddon()-gate at the
 * API level. Gating is frontend-only (admin-nav.ts / teacher-nav.ts's
 * moduleKey: 'LATEX_EDITOR', filtered by Sidebar.tsx the same as every
 * other module).
 *
 * Backfills every existing non-sentinel school with an enabled row, same
 * reasoning as the original BUS backfill in seed-modules.ts: the tool was
 * unconditionally visible to everyone before this change, so converting it
 * to an opt-in module shouldn't take it away from schools that already
 * effectively had it.
 *
 * Safe to re-run: the AddonDefinition upsert keys off `key` (unique); the
 * backfill only creates a SchoolAddon row where one doesn't already exist.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." npx ts-node prisma/seed-latex-module.ts
 */
import { PrismaClient } from '@prisma/client';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Step 1/2: Seeding LATEX_EDITOR catalog entry...');
    const row = await prisma.addonDefinition.upsert({
      where: { key: 'LATEX_EDITOR' },
      update: {},
      create: {
        key: 'LATEX_EDITOR',
        kind: 'MODULE',
        name: 'LaTeX Editor',
        description: 'Standalone LaTeX equation editor and reference tool.',
        category: 'Tools',
      },
    });
    console.log(`  LATEX_EDITOR: ${row.id} (kind=${row.kind})`);

    console.log('Step 2/2: Backfilling LATEX_EDITOR enablement for existing schools...');
    const schools = await prisma.school.findMany({
      where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
      select: { id: true, subdomain: true },
    });
    for (const school of schools) {
      const existing = await prisma.schoolAddon.findUnique({
        where: { schoolId_addonKey: { schoolId: school.id, addonKey: 'LATEX_EDITOR' } },
      });
      if (existing) {
        console.log(`  ${school.subdomain}: already has a LATEX_EDITOR row (enabled=${existing.enabled}), left untouched`);
        continue;
      }
      await prisma.schoolAddon.create({
        data: { schoolId: school.id, addonKey: 'LATEX_EDITOR', enabled: true },
      });
      console.log(`  ${school.subdomain}: created enabled LATEX_EDITOR row`);
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
