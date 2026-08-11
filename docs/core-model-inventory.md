# Core Model Inventory

This inventory reflects `backend/prisma/schema.prisma` after removal of compiled school-feature modules.

## Tenant Core

- `School`, `SchoolDomain`, `SchoolProvisioningJob`
- `User`, `RefreshToken`, `PasswordResetToken`
- `AuditLog`, `AuditCleanupSchedule`, `SchoolDailyMetric`
- `SiteSetting`, `Post`

## Extension Control Plane

- `Extension`, `ExtensionVersion`, `ExtensionAsset`
- `ExtensionPublisher`, `ExtensionSigningKey`, `ExtensionPublisherMember`
- `ExtensionReview`, `ExtensionValidation`, `ExtensionPermission`, `ExtensionDependency`
- `ExtensionVisibilityGrant`, `ExtensionPaymentSetting`
- `ExtensionAlert`, `ExtensionApiMetric`

## Extension School Plane

- `ExtensionInstallation`, `ExtensionRecord`, `ExtensionPilotFeedback`
- `ExtensionMigrationRun`, `ExtensionMigrationBackup`

## Obsolete Models

Legacy classes, students, attendance, fees, timetables, scores, staffing, transport, exams, assignments, messaging, announcements, courses, and notification tables were removed by migration `20260810000011_remove_legacy_feature_schema`. The product owner explicitly requested deletion rather than retention, so no legacy export is required for this reform.

## Ownership Rule

Any future school business feature must be delivered through the extension architecture. Adding a feature-specific Prisma model to the core requires an accepted ADR and platform architecture review.

`backend/src/database/architecture-baseline.spec.ts` enforces this exact model set and prevents removed feature runtime directories from returning unnoticed.
