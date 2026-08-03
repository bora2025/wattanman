# Extension Platform Reform — Planning and Discussion

**Status:** Draft for discussion; Phase 2 theme upload hardening started

**Scope:** Architecture and planning only; no implementation is approved by this document.
**Goal:** Allow platform administrators to upload, review, publish, install, update, and remove module and theme packages distributed as `.zip` files, inspired by WordPress and Moodle while preserving Wattaman's multi-tenant security boundary.

## 1. Why This Reform Is Needed

Wattaman already has a platform-wide add-on directory, per-school enablement, module guards, and limited ZIP upload support. However, the current ZIP packages do not install functional software:

- Add-on packages contain catalog presentation data such as a screenshot and README.
- Theme packages produce a CSS string that is stored in `AddonDefinition.themeConfig.customCss`.
- Functional backend modules, frontend pages, navigation items, and module keys remain compiled into the application.
- Uploading a new catalog entry cannot create a NestJS controller or a Next.js route at runtime.

The reform must therefore introduce a real extension lifecycle rather than expanding the current metadata upload endpoints.

## 2. Existing Architecture to Preserve

The extension platform must retain these important properties:

- Every school request is resolved from its hostname.
- Authenticated requests verify that the JWT school matches the resolved school.
- Prisma operations are automatically scoped by `schoolId`.
- Cross-school access is restricted to authorized platform administration paths.
- Backend access is enforced independently from frontend navigation visibility.
- Extensions are enabled per school and may have billing state.
- Privileged operations are auditable.

The extension system must not create an alternative path around tenant scoping, authentication, roles, add-on guards, or audit logging.

## 3. Core Architectural Decision

### Proposed decision

Support two extension classes with different trust and deployment models.

#### A. Declarative runtime extensions

These packages can be uploaded and installed without rebuilding Wattaman. They describe functionality using validated manifests, page schemas, workflows, permissions, translations, and static assets. Wattaman-owned renderers and services execute the declared behavior.

They must not include executable server-side JavaScript, TypeScript, native binaries, arbitrary SQL, or unrestricted network calls.

#### B. Trusted code extensions

These packages may contain executable code, but must not be loaded directly into the main NestJS or Next.js processes. They require quarantine, automated scanning, isolated builds, manual approval, deployment as separate services or workers, and communication through scoped APIs.

### Reason

A WordPress-style model that executes uploaded code inside the main application process would allow a malicious or defective plugin to access database credentials, environment secrets, the filesystem, or data belonging to every school. That risk is incompatible with Wattaman's multi-tenant architecture.

### Discussion required

- Is the first product goal a no-code/declarative module builder, a trusted internal plugin installer, or a public third-party marketplace?
- Must newly uploaded modules work immediately, or is a build/review/deploy delay acceptable?
- Who may publish packages: Wattaman developers only, selected partners, or any platform administrator?

## 4. Extension Types

The proposed catalog supports:

- `CORE_MODULE`: Functionality compiled and shipped with Wattaman.
- `DECLARATIVE_MODULE`: Runtime pages and workflows interpreted by Wattaman.
- `THEME`: Design tokens, controlled CSS, fonts, and static assets.
- `INTEGRATION`: Connection to an external service through approved capabilities.
- `CODE_EXTENSION`: Separately built and deployed trusted code.

The existing `MODULE`, `ADDON`, and `THEME` business distinction can remain as a commercial classification, but it should not also describe the technical execution model. Commercial type and runtime type should be separate fields.

## 5. Proposed Data Model

### `Extension`

Represents the stable catalog identity.

- `id`
- `key`
- `name`
- `description`
- `publisherId`
- `runtimeType`
- `commercialType`
- `category`
- `status`
- `isListed`
- `createdAt`
- `updatedAt`

### `ExtensionVersion`

Represents one immutable release.

- `id`
- `extensionId`
- `version`
- `manifest`
- `packageStorageKey`
- `packageChecksum`
- `compatibilityRange`
- `validationStatus`
- `reviewStatus`
- `releaseNotes`
- `publishedAt`
- `createdAt`

### `ExtensionInstallation`

Represents one school's installation.

- `id`
- `schoolId`
- `extensionId`
- `installedVersionId`
- `enabled`
- `configuration`
- `billingStatus`
- `installedBy`
- `installedAt`
- `updatedAt`

### Supporting entities

- `ExtensionAsset`: Extracted and validated package assets.
- `ExtensionPermission`: Capabilities requested by a version.
- `ExtensionDependency`: Required or conflicting extensions.
- `ExtensionValidation`: Structured validation and scan results.
- `ExtensionMigration`: Versioned declarative data migrations.
- `ExtensionAudit`: Upload, review, publication, installation, update, rollback, and removal events.

### Migration principle

Existing `AddonDefinition.key` values should remain stable. Existing `SchoolAddon` rows should be backfilled into installation records so current school access is not changed during migration.

## 6. Package Lifecycle

Proposed lifecycle:

1. `UPLOADED`
2. `QUARANTINED`
3. `VALIDATING`
4. `VALIDATED` or `REJECTED`
5. `AWAITING_REVIEW`
6. `APPROVED`
7. `PUBLISHED`
8. `DEPRECATED`, `BLOCKED`, or `RETIRED`

Installation lifecycle:

1. Compatibility check
2. Dependency check
3. Permission review
4. Installation
5. Configuration
6. Activation
7. Upgrade or rollback
8. Deactivation
9. Uninstallation or data retention

Uploading and publishing must be separate actions. A successfully parsed package is not automatically trusted or available to schools.

## 7. Module Package Specification

Proposed layout:

```text
student-rewards/
├── extension.json
├── README.md
├── screenshot.png
├── permissions.json
├── ui/
│   ├── navigation.json
│   ├── pages.json
│   └── forms.json
├── workflows/
│   └── rewards.json
├── translations/
│   ├── en.json
│   └── km.json
└── assets/
```

Proposed `extension.json`:

```json
{
  "schemaVersion": 1,
  "key": "STUDENT_REWARDS",
  "name": "Student Rewards",
  "version": "1.0.0",
  "runtimeType": "DECLARATIVE_MODULE",
  "commercialType": "ADDON",
  "requires": {
    "platform": ">=2.0.0",
    "extensions": ["STUDENT_PORTAL"]
  },
  "roles": ["ADMIN", "TEACHER", "STUDENT"],
  "permissions": [
    "students:read",
    "rewards:read",
    "rewards:write"
  ]
}
```

### Manifest rules

- The extension key is immutable after first publication.
- Versions use semantic versioning.
- The manifest schema is versioned independently from the extension.
- Every capability must be declared.
- Dependencies and conflicts must be explicit.
- Compatibility must be checked before publication and installation.
- Unknown manifest properties should be rejected or explicitly namespaced.

## 8. Theme Package Specification

Proposed layout:

```text
modern-blue/
├── theme.json
├── README.md
├── screenshot.png
├── styles/
│   └── theme.css
├── assets/
│   ├── background.webp
│   └── logo-mark.svg
└── translations/
```

The theme manifest should define:

- Theme key and semantic version.
- Compatible Wattaman versions.
- Light and dark mode support.
- Primary and secondary color tokens.
- Typography and approved font assets.
- Radius, spacing, shadow, and surface tokens.
- Optional approved component variants.
- Asset references.
- Parent theme or inheritance rules, if supported.

### Proposed theme restrictions

- Prefer controlled design tokens over unrestricted CSS.
- Scope CSS beneath a Wattaman theme root selector.
- Reject scripts, event handlers, imports, unsafe URLs, and unsupported file types.
- Sanitize SVG and CSS server-side.
- Store package assets in object storage rather than as database base64 strings.
- Preview themes in an isolated frame or dedicated preview route before publication.

## 9. Dynamic Frontend Design

### Navigation

Navigation should eventually be resolved from:

1. Core navigation definitions.
2. Installed extension navigation manifests.
3. Current user's role and permissions.
4. School installation and activation status.

The frontend should request resolved navigation from the backend instead of requiring every extension key in static TypeScript arrays.

### Pages

Use a stable dynamic route such as:

```text
/extensions/[extensionKey]/[pageKey]
```

The route loads a validated page definition and renders it through a Wattaman-owned component registry. Initially approved components may include:

- Data tables
- Forms
- Detail panels
- Charts
- Filters
- Search controls
- Confirmed actions
- Rich text
- Existing student, class, teacher, and report selectors

The package selects and configures components; it does not provide arbitrary React components.

## 10. Dynamic Backend Design

Declarative extensions should use a controlled API namespace:

```text
/api/extensions/:extensionKey/resources/:resource
```

Every request must validate:

- Tenant context.
- Installed and enabled extension version.
- Authenticated user.
- Role and declared permission.
- Input schema.
- Resource ownership.
- Rate limits and audit requirements.

Packages must not receive Prisma access, raw SQL access, environment variables, filesystem access, or arbitrary outbound HTTP access.

### Extension-owned data

Options requiring further discussion:

1. Shared generic records table with JSON data and strict schemas.
2. Platform-provisioned tables generated from declarative resource schemas.
3. External isolated plugin database for code extensions.

The generic JSON record model is easiest to introduce but may become inefficient for reporting and relationships. Generated tables offer stronger querying but require a carefully controlled migration engine. Direct plugin-defined SQL migrations are not recommended for runtime uploads.

## 11. Trusted Code Extension Model

Executable extensions, if approved later, should follow this pipeline:

1. Upload package to quarantine storage.
2. Verify checksum and optional publisher signature.
3. Scan package contents and dependencies.
4. Build inside an isolated container without production secrets.
5. Run contract, security, compatibility, and migration tests.
6. Require manual review and approval.
7. Publish an immutable build artifact.
8. Deploy as a separate service or worker.
9. Issue a narrow service identity with declared API scopes.
10. Monitor health, resource use, errors, and audit events.

Code extensions should communicate with Wattaman through authenticated APIs, events, and webhooks. They should not connect directly to the main database.

## 12. ZIP Upload Security Requirements

Server-side validation is the security boundary. Client-side parsing may support previews but is not sufficient.

Required controls:

- Maximum compressed package size.
- Maximum extracted size.
- Maximum file count.
- Maximum directory depth.
- Compression-ratio limits for ZIP bomb detection.
- Rejection of absolute paths and `../` traversal.
- Rejection of symlinks and hard links.
- Rejection of duplicate normalized paths.
- File extension and content-type allowlists.
- MIME detection from file content.
- Sanitization of CSS, SVG, HTML, and Markdown.
- Rejection of executable and native binary files for declarative packages.
- SHA-256 checksums for original packages and extracted assets.
- Malware and dependency scanning for code packages.
- Immutable storage for published versions.
- Audit records for every privileged lifecycle action.

The extraction process should run in a temporary isolated environment with strict time, memory, CPU, and disk limits.

## 13. Permissions and Capabilities

Extensions should request named capabilities rather than broad database access.

Examples:

- `students:read`
- `students:write`
- `classes:read`
- `attendance:read`
- `attendance:record`
- `reports:generate`
- `notifications:send`
- `files:store`
- `external-http:approved-domain`

Publication review should show requested capabilities. School installation should also show them, especially sensitive or newly added permissions.

Permissions granted to one extension version must not silently expand during upgrade. An upgrade requesting additional capabilities should require explicit approval.

## 14. Dependencies, Updates, and Rollback

The platform should support:

- Required dependencies.
- Optional dependencies.
- Conflicting extensions.
- Minimum and maximum compatible platform versions.
- Upgrade paths and skipped-version handling.
- Automatic or manual school update policies.
- Previous-version rollback.
- Blocking a compromised version.
- Preventing uninstall while dependents remain installed.

Published versions should be immutable. Fixes must create a new version rather than modifying an existing package.

## 15. Uninstallation and Data Ownership

Uninstall behavior must be decided before implementation.

Possible policies:

- Disable only and retain all data.
- Soft uninstall with a configurable retention period.
- Export data before deletion.
- Permanent deletion requiring explicit confirmation.

Recommended default: deactivate immediately, retain extension data for a defined recovery period, and require a separate privileged action for permanent deletion.

## 16. Platform Administration UX

Proposed platform pages:

- Extension directory
- Upload package
- Validation report
- Version history
- Review and publication
- Compatibility matrix
- Installation usage by school
- Security and permission summary
- Deprecation or emergency block
- Audit history

The upload wizard should show:

1. Package selected
2. Manifest detected
3. Validation progress
4. Errors and warnings
5. Requested permissions
6. Compatibility results
7. Preview
8. Review decision
9. Publication confirmation

## 17. School Administration UX

School administrators should be able to:

- Browse available extensions and themes.
- Review descriptions, screenshots, versions, pricing, and permissions.
- Request paid extensions.
- Install or enable approved free extensions.
- Configure installed extensions.
- Preview and activate themes.
- Review available updates.
- Roll back when permitted.
- Deactivate or uninstall according to policy.

Platform administrators retain final control over paid activation, publication, blocked versions, and trusted code extensions.

## 18. Observability and Recovery

The extension platform should expose:

- Installation and activation failures.
- Validation and scan failures.
- Extension API error rates.
- Slow operations.
- Storage and record usage.
- Version adoption by school.
- Failed upgrades and rollbacks.
- Security-sensitive capability use.

An emergency kill switch should disable one extension version across all schools without requiring an application redeploy.

## 19. Phased Delivery Plan

### Phase 0 — Product decisions

- Agree on extension trust levels and publisher policy.
- Define the first supported declarative capabilities.
- Decide object storage and malware-scanning services.
- Decide data retention and commercial rules.
- Approve package and manifest terminology.

### Phase 1 — Extension foundation

- Introduce versioned extension entities.
- Add object storage for packages and assets.
- Implement server-side upload, quarantine, and validation.
- Add validation reports and audit events.
- Preserve the existing add-on catalog and school toggles during migration.

### Phase 2 — Versioned themes

- Formalize `theme.json`.
- Validate and extract theme packages server-side.
- Replace base64 asset storage with object-storage URLs.
- Add preview, review, publish, install, activate, upgrade, and rollback flows.
- Migrate current `themeConfig` and custom CSS into legacy theme versions.

Themes should be the first implementation because they require no new business data or executable server behavior.

### Phase 3 — Declarative module runtime

- Add manifest-driven navigation.
- Add the dynamic extension page route.
- Build the approved UI component registry.
- Build scoped resource and action APIs.
- Add capability enforcement, dependencies, and compatibility checks.
- Pilot one low-risk module.

Suggested pilot: a simple reporting, resource directory, or utility module. Attendance, fees, salary, and authentication should not be the first pilot because they are operationally sensitive.

### Phase 4 — Marketplace operations

- Add publisher identities.
- Add review workflows and release notes.
- Add version adoption and health dashboards.
- Add update policies, deprecation, emergency blocking, and rollback controls.
- Add package signing for trusted publishers.

### Phase 5 — Isolated code extensions

- Define an external plugin SDK and contracts.
- Add isolated build and test infrastructure.
- Add dependency and vulnerability scanning.
- Deploy extensions as separate services or workers.
- Add scoped service tokens, events, and webhook APIs.
- Pilot only with Wattaman-developed extensions.

## 20. Migration Strategy

Proposed migration order:

1. Create new extension tables without removing existing tables.
2. Backfill each `AddonDefinition` into an `Extension` and initial `ExtensionVersion`.
3. Classify compiled modules as `CORE_MODULE`.
4. Convert `SchoolAddon` rows into installation records while preserving keys and enabled states.
5. Convert current theme configurations into legacy versioned theme packages.
6. Run existing and new extension resolution in parallel.
7. Move navigation and guards to the new resolver incrementally.
8. Stop writing old structures after verification.
9. Remove legacy structures only in a later release.

Every migration phase needs tenant-isolation and workflow tests before production rollout.

## 21. Main Risks

- Arbitrary code execution in the primary application.
- Cross-school data leakage through extension APIs or data storage.
- ZIP bombs, path traversal, malicious SVG/CSS, and dependency malware.
- Broken schools after an incompatible upgrade.
- Static frontend assumptions conflicting with runtime-installed pages.
- Permission expansion hidden inside updates.
- Database complexity from user-defined resources.
- Extension data loss during uninstall or rollback.
- Platform startup failure caused by an extension.
- Storage growth from immutable packages and versions.

## 22. Success Criteria

The first production milestone is successful when a platform administrator can:

1. Upload a theme ZIP.
2. Receive a server-generated validation report.
3. Preview the theme safely.
4. Approve and publish an immutable version.
5. Install and activate it for a selected school.
6. Upgrade or roll back without redeploying Wattaman.
7. Review a complete audit trail.

The declarative module milestone is successful when a new low-risk module can add navigation, pages, tenant-scoped data, permissions, and workflows without changing or rebuilding the Wattaman source application.

## 23. Open Discussion Questions

### Product and ownership

1. Will extensions initially be created only by the Wattaman development team?
2. Can every platform administrator upload packages, or only a new publisher/reviewer role?
3. Is a public third-party marketplace a real goal or only an internal package installer?
4. Should schools install free modules directly or always request platform approval?

### Module capabilities

5. What is the first real module we want to install from ZIP?
6. Must modules create custom database records and relationships?
7. Must modules integrate with existing students, classes, attendance, fees, and messaging?
8. Do modules require background jobs, scheduled tasks, notifications, or external APIs?
9. Do modules need custom print and PDF layouts?

### Themes

10. Should themes control only colors, fonts, spacing, radius, and images, or full component layouts?
11. Can a theme change public-site pages separately from authenticated dashboards?
12. Are custom fonts allowed, and what licensing checks are required?
13. Should schools be able to customize an installed theme and preserve overrides during upgrades?

### Security and operations

14. Which object storage provider should hold packages and assets?
15. Is package signing required from the first release?
16. Who reviews validation warnings and requested permissions?
17. What is the emergency response when a published extension is compromised?
18. How long should extension data remain after uninstall?

### Commercial model

19. Are modules and themes sold once, monthly, yearly, or manually invoiced as today?
20. Can one package have different plans or feature tiers?
21. Should disabling for overdue billing be automatic or remain a platform-admin action?

### Technical direction

22. Is immediate runtime installation required for modules?
23. Is a controlled declarative UI acceptable, or must packages provide custom React interfaces?
24. If custom code is required, is deployment as an isolated service acceptable?
25. Should Wattaman provide a local extension development CLI and package validator?

## 24. Decisions Log

Record agreed decisions here so later implementation does not reinterpret earlier discussions.

| Date | Decision | Reason | Status |
|---|---|---|---|
| TBD | Use declarative themes as the first milestone | Lowest-risk validation of the package lifecycle | Proposed |
| TBD | Do not execute uploaded server code in the main application | Protect tenant data and production secrets | Proposed |
| TBD | Keep package versions immutable | Enables auditing, compatibility checks, and rollback | Proposed |
| 2026-08-03 | Start by moving theme ZIP parsing and validation to the backend | Establishes a trustworthy upload boundary before versioning and publication workflows | In progress |

## 25. Next Discussion

The next discussion should answer these questions first:

1. Who is allowed to create and publish extensions?
2. What exact module should be the first ZIP-installed module?
3. Does that module require custom data, custom UI, background work, or external integrations?
4. How much layout freedom should a theme package receive?
5. Is the first release internal-only or intended for third-party publishers?

After those answers, this document can be refined into an approved architecture, package schema, database migration plan, API contracts, and implementation backlog.
