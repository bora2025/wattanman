# Stage 0 Validation

## Repeatable Checks

Run from a clean checkout:

```powershell
Set-Location backend
npm ci --legacy-peer-deps
npm run build
npm test -- --runInBand database/architecture-baseline.spec.ts

Set-Location ../frontend
npm ci --legacy-peer-deps
npm run build
```

The PostgreSQL-backed CI workflow additionally runs tenant isolation and the complete extension lifecycle E2E after applying the migration chain to an empty PostgreSQL 16 database. The migration chain was locally replayed from empty with all 29 migrations and verified with `prisma migrate diff --exit-code` showing no schema drift.

## Rollback

Build and test changes do not mutate production. If an architecture inventory change is rejected, revert the inventory and its associated implementation in one commit. Never restore a removed feature model without an accepted ADR and an expand-and-contract migration.

The destructive cleanup rehearsal remains a separate prerequisite. Follow `docs/destructive-cleanup-rehearsal.md`; retain and independently verify its signed production-sized report before checking that TODO item.
