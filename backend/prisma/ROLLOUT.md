# Production Database Release Runbook

## Invariants

- API startup never mutates schema or seeds data.
- Railway executes `node prisma/release-migrate.js` once as the pre-deploy release command.
- The release runner holds PostgreSQL advisory lock `864220261` while `prisma migrate deploy` runs.
- API startup executes `node prisma/check-schema-compatibility.js` and refuses traffic if this release has pending or failed migrations.
- Production never uses `prisma db push` or `--accept-data-loss`.
- The release runner narrowly records `20260728000000_legacy_schema_baseline` as applied when an already-migrated database has both core tables and non-empty migration history. This makes the newly reconstructed fresh-install baseline safe for existing deployments without executing its DDL twice.

## One-Time Legacy Adoption

Only a database created before Prisma migration history exists needs adoption. Back it up, restore the backup into staging, verify staging matches `prisma/schema.prisma`, and then run:

```bash
DATABASE_URL="<production URL>" npm run db:migrate:adopt
```

Do not force adoption after a schema-difference failure. Review and reconcile drift first. New environments and databases with `_prisma_migrations` never run adoption.

## Standard Release

1. Confirm point-in-time recovery and the latest snapshot are healthy.
2. Rehearse pending migrations against a recent production-sized restore.
3. Review SQL for destructive operations, locks, table rewrites, and estimated duration.
4. Deploy the release. Railway runs the locked pre-deploy migration command.
5. The API compatibility check confirms every migration bundled in the image is applied.
6. Verify `/health`, tenant login, platform login, domain resolution, and extension lifecycle smoke tests.
7. Record migration names, application commit, start/end times, and operator in the release record.

Manual release command:

```bash
cd backend
DATABASE_URL="<migration-role URL>" npm run db:migrate:release
DATABASE_URL="<runtime-role URL>" npm run db:schema:check
```

## Expand-and-Contract Rule

Schema changes that affect live code use at least two releases:

1. **Expand:** add nullable columns/tables/indexes without removing old structures.
2. Deploy code that can read both shapes and writes the new shape.
3. Backfill asynchronously and verify counts/checksums.
4. Deploy code that no longer depends on the old shape.
5. **Contract:** remove obsolete columns/tables in a later reviewed release.

Large indexes use PostgreSQL-safe online strategies where transaction restrictions permit. Long table rewrites require a maintenance plan and measured rehearsal.

## Application Rollback

Roll back API and worker images only when the previous version is compatible with the expanded schema. The compatibility check must pass for the target image. Never reverse a migration merely to roll back application code.

## Migration Failure

1. The pre-deploy command fails and prevents new API rollout.
2. Keep the existing application revision serving traffic when compatible.
3. Inspect `_prisma_migrations.logs` and PostgreSQL locks/errors.
4. Correct the migration in a new roll-forward migration whenever possible.
5. Use `prisma migrate resolve` only after an operator verifies the exact database state and records the decision.
6. For destructive corruption, stop writes and restore the rehearsed snapshot according to the disaster-recovery runbook.

## Roll-Forward Verification

After recovery, run `npm run db:migrate:release`, then `npm run db:schema:check`, focused data checks, tenant-isolation E2E, and extension lifecycle E2E before resuming rollout.
