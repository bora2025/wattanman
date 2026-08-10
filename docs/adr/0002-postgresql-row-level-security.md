# ADR 0002: PostgreSQL Row-Level Security

- Status: Accepted
- Date: 2026-08-10

## Decision

All tenant-owned tables use PostgreSQL row-level security in addition to Prisma application scoping. School requests execute in a database transaction that sets `app.current_school_id` with `SET LOCAL`. Policies compare each row's `schoolId` with `current_setting('app.current_school_id', true)` and deny access when the setting is absent.

Separate NOLOGIN group roles define migration, control-plane, school-runtime, and analytics privileges. Environment-specific LOGIN roles inherit exactly one group. The migration owner is not used by API containers. School runtime cannot bypass RLS. Control-plane bypass is limited to audited platform operations and uses a separate connection identity.

## Consequences

- Request and job code must establish explicit database scope before tenant queries.
- Connection pooling is safe because tenant state is transaction-local.
- Raw SQL and background jobs must use the same scoped transaction contract.
- `FORCE ROW LEVEL SECURITY` is required on tenant tables so table ownership cannot silently bypass policies during tests.

## Rollback

Policies can be disabled only during an audited emergency migration using the migration role. Application rollback must retain database policies and tenant transaction setup.
