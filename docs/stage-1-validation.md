# Stage 1 Validation

## Tenant Isolation

GitHub Actions run `31451747701` applied all migrations to PostgreSQL 16, passed the extension-first two-school isolation suite, built the backend, and passed the complete extension lifecycle E2E.

The isolation suite proves unknown hosts fail closed, JWTs cannot cross school domains, overlapping identities remain isolated, and extension records cannot be read, written, deleted, or exported across tenants.

## Provisioning Idempotency

`SchoolsService` uses a unique provisioning `requestKey`, returns the existing job on replay, and creates the school, first administrator, base settings, and provisioning job in one transaction. `SchoolDomainService` uses hostname upsert. Focused provisioning/domain tests pass and verify no create operation occurs on replay.

## Repeatable Commands

```powershell
Set-Location backend
npm test -- --runInBand platform/schools.service.spec.ts tenancy/school-domain.service.spec.ts
npm run test:isolation
npm run test:lifecycle
```

The E2E commands require an empty migrated PostgreSQL 16 database. CI is the required authoritative environment.

## Rollback

Tenant fail-closed behavior must not be rolled back. If provisioning code is reverted, retain the `requestKey`, hostname uniqueness constraints, and transactional create boundary. Recover a failed provisioning operation by replaying or retrying its existing job, never by inserting a second school manually.

## 1,000-school scale rehearsal

Run the deterministic, bounded rehearsal against an isolated database:

```powershell
$env:DATABASE_ADMIN_URL = '<isolated-admin-url>'
Set-Location backend
npm run db:provisioning:rehearse
```

The command creates schools in batches of 100 with exactly one administrator,
site setting, completed provisioning job, and verified managed domain per school.
It verifies all 1,000 record sets, verifies zero extension installations, and
deletes its fixtures after success. The August 11, 2026 rehearsal completed in
3,120 ms and observed exactly 1,000 rows in every required category.

Use a unique `SYNTHETIC_SCHOOL_PREFIX` for concurrent rehearsals. Counts are
bounded at 10,000 and batch size at 500. Production execution additionally
requires `CONFIRM_SYNTHETIC_PROVISIONING` to exactly match the prefix. Fixtures
are retained only when `SYNTHETIC_SCHOOL_KEEP=true`; rollback is rerunning the
command with the same prefix and retention disabled, which cascade-deletes only
schools whose subdomains begin with that guarded prefix.
