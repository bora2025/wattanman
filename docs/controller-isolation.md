# Controller Isolation Coverage

`backend/src/database/controller-isolation-registry.spec.ts` inventories every retained controller. Adding a controller requires explicit classification and test updates.

## Tenant Data Surfaces

- `AuthController`: users and current identity.
- `AuditController`: logs, facets, exports, statistics, activity, and schedules.
- `BackupController`: tenant-only export/restore.
- `PostsController`: authenticated and public post reads.
- `SiteSettingsController`: public tenant appearance/settings.
- School-facing extension controllers: directory, installations, navigation, pages, and records.

The two-school E2E seeds overlapping users, posts, settings, audit logs, installations, and extension records. It verifies School A reads contain A identifiers and never B identifiers, including public endpoints that have no JWT but still resolve host tenancy.

## Control-Plane Surfaces

Extension governance, extension installation operations, platform administrators, school metrics, and school lifecycle controllers require `JwtAuthGuard`, `RolesGuard`, `PlatformScopeGuard`, and `PLATFORM_ADMIN`. The E2E verifies school administrator credentials receive `403` on every platform controller surface.

## Infrastructure

`AppController` health probes carry no tenant data. Its public root and image proxy remain behind host resolution except the explicit health exclusions. Authentication endpoints establish or verify tenant identity and use the same transaction-local database scope after domain resolution.

## Required Check

`npm run test:isolation` is the authoritative cross-school controller test and runs after FORCE RLS activation with separate runtime/control identities in CI.
