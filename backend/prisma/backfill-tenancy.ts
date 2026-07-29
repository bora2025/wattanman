/**
 * One-off production data migration — Phase 8c of the multi-tenant
 * conversion plan. NOT part of the app runtime; run once, by hand, via
 * ts-node, after migration 1 (20260729000001_add_school_and_nullable_schoolid)
 * has been deployed and BEFORE migration 2 (20260729000002_tighten_schoolid_constraints)
 * is deployed.
 *
 * What it does:
 *   1. Creates the platform sentinel School row (subdomain "platform") if it
 *      doesn't already exist — needed before any PLATFORM_ADMIN account can
 *      be created (Phase 1a).
 *   2. Creates (or reuses, if re-run) one real School row for the school
 *      that's actually operating today, using BACKFILL_SCHOOL_NAME /
 *      BACKFILL_SCHOOL_SUBDOMAIN from the environment.
 *   3. For every tenant-scoped table, UPDATEs every row with a NULL
 *      schoolId to that real school's id. Uses TENANT_SCOPED_MODELS as the
 *      single source of truth for which tables are tenant-scoped, so this
 *      never drifts out of sync with backend/src/database/prisma.service.ts's
 *      own guardrail.
 *   4. Re-checks every table for remaining NULLs and refuses to report
 *      success if any remain — migration 2's `SET NOT NULL` would fail
 *      loudly on those rows anyway (verified: see the multi-tenant plan's
 *      Phase 8 status notes), but failing here first gives a clear,
 *      per-table breakdown instead of one opaque Postgres error.
 *
 * Safe to re-run: every step is idempotent (reuses existing School rows by
 * subdomain, and the backfill UPDATE only ever touches rows still NULL).
 *
 * Usage:
 *   BACKFILL_SCHOOL_NAME="Wattaman Demo School" \
 *   BACKFILL_SCHOOL_SUBDOMAIN="wattaman" \
 *   DATABASE_URL="postgresql://...production..." \
 *   npx ts-node prisma/backfill-tenancy.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TENANT_SCOPED_MODELS } from '../src/tenancy/scoped-models';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const SCHOOL_NAME = process.env.BACKFILL_SCHOOL_NAME;
const SCHOOL_SUBDOMAIN = process.env.BACKFILL_SCHOOL_SUBDOMAIN;

// School itself is never tenant-scoped (it IS the tenant). Every other model
// in TENANT_SCOPED_MODELS is a real Postgres table with the same name (this
// schema never uses @@map), so the set can be used directly as table names.
const TABLES_TO_BACKFILL = Array.from(TENANT_SCOPED_MODELS);

async function findOrCreateSchool(prisma: PrismaClient, subdomain: string, name: string): Promise<string> {
  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "School" WHERE subdomain = $1`,
    subdomain,
  );
  if (existing.length > 0) {
    console.log(`  Reusing existing School "${subdomain}" (${existing[0].id})`);
    return existing[0].id;
  }
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "School" (id, subdomain, name, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', now(), now())`,
    id,
    subdomain,
    name,
  );
  console.log(`  Created School "${subdomain}" (${id})`);
  return id;
}

async function main() {
  if (!SCHOOL_NAME || !SCHOOL_SUBDOMAIN) {
    console.error('Set BACKFILL_SCHOOL_NAME and BACKFILL_SCHOOL_SUBDOMAIN before running.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log('Step 1/4: Ensuring the platform sentinel School row exists...');
    await findOrCreateSchool(prisma, PLATFORM_SCHOOL_SUBDOMAIN, 'Wattaman Platform');

    console.log(`Step 2/4: Ensuring the real School row exists ("${SCHOOL_SUBDOMAIN}")...`);
    const schoolId = await findOrCreateSchool(prisma, SCHOOL_SUBDOMAIN, SCHOOL_NAME);

    console.log(`Step 3/4: Backfilling schoolId = ${schoolId} across ${TABLES_TO_BACKFILL.length} tables...`);
    for (const table of TABLES_TO_BACKFILL) {
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "schoolId" = $1 WHERE "schoolId" IS NULL`,
        schoolId,
      );
      if (updated > 0) console.log(`  ${table}: backfilled ${updated} row(s)`);
    }

    console.log('Step 4/4: Verifying zero NULL schoolId values remain...');
    let anyNull = false;
    for (const table of TABLES_TO_BACKFILL) {
      const remaining = await prisma.$queryRawUnsafe<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM "${table}" WHERE "schoolId" IS NULL`,
      );
      const count = Number(remaining[0].count);
      if (count > 0) {
        anyNull = true;
        console.error(`  ${table}: ${count} row(s) STILL have NULL schoolId`);
      }
    }

    if (anyNull) {
      console.error('\nBackfill INCOMPLETE. Do not deploy migration 2 — it will fail (correctly) on these rows.');
      process.exit(1);
    }
    console.log('\nBackfill complete. Zero NULL schoolId values remain anywhere. Safe to deploy migration 2.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
