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
