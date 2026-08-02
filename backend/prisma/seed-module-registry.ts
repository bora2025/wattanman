/**
 * Phase 22 — the module catalog seed, replacing 4 one-off scripts
 * (seed-modules.ts, seed-portal-modules.ts, seed-timetable-chat-modules.ts,
 * seed-latex-module.ts) with one script driven by the registry
 * (backend/src/module-registry/module-registry.ts) instead of a hand-copied
 * literal array in each new script. Adding a module going forward means
 * adding one entry to the registry and running this.
 *
 * Deliberately does NOT repeat the one-time backfills those 4 scripts also
 * did (enabling their modules for every existing school) — those already
 * ran and were verified against production in Phases 9/11/12. A newly
 * registered module starts disabled for existing schools by default, same
 * as every module has under the opt-in model since Phase 9.
 *
 * Safe to re-run: upserts key off `key` (unique); `update: {}` means a
 * platform-admin's own edit to name/description/category survives a re-run.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." npx ts-node prisma/seed-module-registry.ts
 */
import { PrismaClient } from '@prisma/client';
import { MODULE_REGISTRY } from '../src/module-registry/module-registry';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Seeding ${MODULE_REGISTRY.length} MODULE catalog entries from the registry...`);
    for (const m of MODULE_REGISTRY) {
      const row = await prisma.addonDefinition.upsert({
        where: { key: m.key },
        update: {}, // don't clobber platform-admin edits (name/description/category/isActive) on re-run
        create: { key: m.key, kind: 'MODULE', name: m.name, description: m.description, category: m.category },
      });
      console.log(`  ${m.key}: ${row.id} (kind=${row.kind})`);
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
