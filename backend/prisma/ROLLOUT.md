# Phase 8 rollout runbook — multi-tenant conversion

This is the step-by-step sequence for taking the multi-tenant conversion
(Phases 0–7a of `smooth-stirring-taco.md`) from this branch to real
production, without wiping or corrupting the real school's existing data.
Every artifact this runbook references has been built and tested against a
copy of the real production schema (extracted from commit `baef556`, the
last commit before this conversion's work began) — see the "What's been
verified" section at the bottom for exactly what was and wasn't proven.

**Nothing in this runbook has been run against real production.** This
sandbox has no access to it. Every step below is written for a human with
real production access to execute deliberately, one step at a time — not to
be scripted/automated blindly.

## 0. Safe deploy command

`backend/railway.json` now runs this on every boot:

```
node prisma/bootstrap-migrations.js && node prisma/seed-prod.js && node dist/main
```

The bootstrap applies pending migrations when migration history exists. It
creates and baselines a completely empty database, but refuses to alter an
existing database that has no migration history. It never passes
`--accept-data-loss` and startup stops if migration preparation fails.

## 1. One-time: baseline Prisma's migration history

This repo has used `prisma db push` exclusively until now — there's no
`_prisma_migrations` tracking table in production, even though
`backend/prisma/migrations/` now contains real migration files (added in
this pass). Prisma's `migrate deploy` refuses to run against a database it
has no history for without an explicit baseline step, since otherwise it
would try to `CREATE TABLE "User"` etc. that already exist and fail
immediately.

Back up the existing database, then run the guarded adoption command once:

```bash
cd backend
DATABASE_URL="<production URL>" npm run db:migrate:adopt
```

The command first runs `prisma migrate diff` against `schema.prisma`. It
records the existing migrations as applied only when no schema difference
exists. A missing table, extra table, column, index, or constraint causes a
failure without modifying migration history. Do not force adoption after a
failure; reconcile and review the reported drift first.

After this, `npm run db:migrate:bootstrap`/`prisma migrate deploy` becomes
the mechanism for every future schema change. Do not use `db push` against
production again.

## 2. 8a — Pre-flight backup

With the app still running its current (pre-multi-tenant) code:

```bash
# Hits the existing, unmodified /backup/export endpoint — your real rollback artifact
curl -H "Authorization: Bearer <an ADMIN token>" https://<production>/backup/export -o pre-tenancy-backup.json
```

Also snapshot per-table row counts (`SELECT count(*) FROM "User"`, etc. for
every table) — this is what you diff against after 8c's backfill to confirm
nothing was silently dropped.

## 3. 8b — Deploy migration 1 (nullable, backward-compatible)

```bash
DATABASE_URL="<production URL>" npx prisma migrate deploy
```

This applies `20260729000001_add_school_and_nullable_schoolid` — creates
`School`, `PasswordResetToken`, `SchoolAddon`, and a **nullable** `schoolId`
column everywhere else, plus indexes and foreign keys. Verified (see below)
to apply cleanly against a copy of the real production schema. The
currently-running (pre-multi-tenant) app code doesn't read or write
`schoolId` at all, so it keeps working completely unmodified against this
schema — **you do not need to deploy any new app code yet.**

## 4. 8c — Run the backfill script

```bash
BACKFILL_SCHOOL_NAME="<the real school's display name>" \
BACKFILL_SCHOOL_SUBDOMAIN="<the subdomain you want it to live at, e.g. 'wattaman'>" \
DATABASE_URL="<production URL>" \
TS_NODE_COMPILER_OPTIONS='{"ignoreDeprecations":"5.0"}' \
npx ts-node -T prisma/backfill-tenancy.ts
```

(The `TS_NODE_COMPILER_OPTIONS` override works around a pre-existing,
unrelated `tsconfig.json` deprecation-flag mismatch in this repo — same
issue `tsc --noEmit` needs `--ignoreDeprecations 5.0` for.)

Creates the platform sentinel School row, creates the real school's School
row, and backfills every tenant-scoped table's NULL `schoolId` to that
school's id. Prints a per-table summary and **refuses to report success**
(exits non-zero) if any NULLs remain anywhere. Safe to re-run — every step
is idempotent (reuses existing School rows by subdomain; the backfill
`UPDATE` only ever touches rows still NULL).

**Do not proceed to step 5 until this reports "Backfill complete."**

## 5. 8d — Deploy migration 2 (tighten)

Dry-run against a clone of production first if at all possible — restore
step 2's backup into a scratch database and apply both migrations plus the
backfill there before touching production, exactly as this runbook's own
verification did (see below).

```bash
DATABASE_URL="<production URL>" npx prisma migrate deploy
```

This applies `20260729000002_tighten_schoolid_constraints` — sets `schoolId`
`NOT NULL` everywhere, drops the old globally-unique indexes (e.g.
`User_email_key`), and adds the new schoolId-composite ones that replace
them. **Verified (below) that this fails loudly with a clear Postgres error
naming the exact table if any row still has a NULL `schoolId`** — it does
not silently corrupt anything if step 4 was skipped or incomplete.

## 6. 8e — Deploy the application code

Now deploy this branch's backend and frontend (all of Phases 2–6's code).
The schema is fully backfilled and `NOT NULL`, so the tenancy guardrail
(`PrismaService`'s scoping middleware), `TenantHostMiddleware`, the Platform
tier, etc. all have a correctly-shaped database to run against.

## 7. 8f — Cutover

Point the real school's subdomain (whatever you chose as
`BACKFILL_SCHOOL_SUBDOMAIN` in step 4, under `SCHOOL_ROOT_DOMAIN`) at the
app, and stand up `PLATFORM_HOST` separately. This step is DNS/infra
coordination outside this repo — plan the redirect for existing
bookmarks/PWA installs before doing it, not after.

## 8. 8g — Rollback plan

- A problem found at step 5 (before it succeeds) needs no rollback — it
  simply refuses to apply; the database stays at migration 1's state, which
  the pre-multi-tenant app code still runs against unmodified.
- A problem found only after step 6 (app code deployed) has step 2's backup
  as a real restore point. **Rehearse restoring from it once, into a scratch
  database, before go-live** — not for the first time under pressure.

---

## What's been verified (and what hasn't)

Everything below was run against a scratch Postgres loaded with the actual
production schema (extracted via `git show baef556:backend/prisma/schema.prisma`
— the real commit currently deployed), not a guess or approximation:

- Migration 1 applies cleanly (zero errors) against a copy of the real
  production schema.
- Migration 2, applied to an **empty** copy of that schema, also applies
  cleanly (trivial — no rows to violate `NOT NULL`, so this alone doesn't
  prove much).
- Migration 2, applied to a copy with one deliberately-unbackfilled row
  planted in it, **fails loudly and specifically**: `ERROR: column
  "schoolId" of relation "Department" contains null values` — proving the
  "fails safely, doesn't corrupt data" property is real, not assumed.
- `backfill-tenancy.ts` was actually run (via `ts-node`, not just
  type-checked) against a scratch database seeded with a few rows across
  different tables (`User`, `Class`, `Department`) with NULL `schoolId`:
  created both School rows, backfilled every NULL, and correctly reported
  success. Re-run a second time to confirm idempotency — no duplicate
  School rows, no errors, correctly reported nothing left to do.
- The full sequence (migration 1 → backfill → migration 2) was run
  end-to-end against that same scratch database: final schema matches
  (`schoolId NOT NULL`, composite unique index present), and the original
  test data survived intact with the correct `schoolId`.

**Not done, and deliberately out of scope for this pass**: none of this ran
against a full clone of the *actual* production dataset (row counts,
real-world edge cases like unusual existing data shapes) — only against the
real schema with small, hand-inserted test rows. Step 5's own instructions
above call for a dry-run against a real production clone before touching
production, and that step still needs to happen for real, by whoever has
that access.
