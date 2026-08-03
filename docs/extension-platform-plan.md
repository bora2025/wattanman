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
| 2026-08-03 | Limit the initial extension program to Wattaman-internal publishers | Reduces supply-chain and support risk while the platform matures | Accepted |
| 2026-08-03 | Use declarative modules and never execute uploaded code in the primary application | Preserves tenant isolation and protects production secrets | Accepted |
| 2026-08-03 | Use Cloudflare R2 for package and extracted-asset storage | Provides S3-compatible object storage without storing packages in PostgreSQL | Accepted |
| 2026-08-03 | Require school requests and platform-admin approval for installation | Keeps publication and tenant activation under platform control | Accepted |
| 2026-08-03 | Retain extension data for 30 days after uninstall | Supports recovery while providing a defined deletion window | Accepted |
| 2026-08-03 | Use Student Rewards as the first declarative module pilot | Exercises navigation, roles, tenant data, and workflows with lower operational risk | Accepted |
| 2026-08-03 | Allow authenticated platform admins to upload, review, and publish internal packages; separation of uploader and reviewer is not required for the initial internal release | Keeps the first operating model small while retaining named actors and audit history | Accepted |
| 2026-08-03 | Suspend a publisher by unlisting and disabling its extensions; revoke compromised versions with the global block workflow and preserve artifacts as evidence | Provides immediate containment and forensic retention | Accepted |
| 2026-08-03 | Defer isolated executable extensions until a later explicitly approved roadmap stage | Declarative packages satisfy the initial use cases without introducing executable supply-chain risk | Accepted |
| 2026-08-03 | Limit v1 declarative UI to role-filtered navigation, schema-driven forms and tables, and tenant-scoped CRUD with declared read/write capabilities | Provides useful modules without arbitrary React, HTML, scripts, SQL, filesystem, or network access | Accepted |
| 2026-08-03 | Retain published artifacts while supported and remove unreferenced rejected or retired package objects after 30 days | Balances rollback/evidence needs against storage cleanup | Accepted |
| 2026-08-03 | Limit compressed packages to 5 MB, extracted packages to 10 MB, and each school to 100 MB of extension-owned records and assets | Establishes bounded initial quotas suitable for declarative packages | Accepted |
| 2026-08-03 | Do not require antivirus for Wattaman-internal declarative v1 packages; require it before external publishers or executable extensions | Static allowlisting and no-code execution provide the initial boundary while avoiding false assurance | Accepted |
| 2026-08-03 | Support manual invoicing only initially; overdue billing never disables an installation automatically | Keeps technical lifecycle changes explicit and audited | Accepted |
| 2026-08-03 | Keep runtime type separate from commercial catalog type | Technical isolation requirements must not depend on pricing classification | Accepted |
| 2026-08-03 | Assign the Wattaman Platform team as owner of Aurora Khmer and Student Rewards pilots | Gives both first milestones an accountable operating owner | Accepted |

## 25. Next Discussion

The next discussion should answer these questions first:

1. Who is allowed to create and publish extensions?
2. What exact module should be the first ZIP-installed module?
3. Does that module require custom data, custom UI, background work, or external integrations?
4. How much layout freedom should a theme package receive?
5. Is the first release internal-only or intended for third-party publishers?

After those answers, this document can be refined into an approved architecture, package schema, database migration plan, API contracts, and implementation backlog.

## 26. Implementation TODO and Stage Gates

This section is the source of truth for implementation progress. Update it in the same pull request that completes an item.

### Status rules

- `[x]` means implemented, tested, documented, and accepted by the stage completion gate.
- `[ ]` means not complete. Items labelled **PARTIAL** have some code but still fail the completion gate.
- A stage is complete only when every required checkbox in that stage is checked.
- Passing compilation alone does not complete a feature. Required tests, authorization, tenant isolation, audit logging, failure handling, and operator documentation must also pass.
- Proposed or undecided behavior cannot be marked complete until its decision-log entry is `Accepted`.

### Current summary

| Stage | Status | Current result |
|---|---|---|
| Existing foundation | Complete | Catalog, school enablement, guards, theme application, and platform roles already exist |
| Stage 0 — Product decisions | In progress | Initial internal-release defaults are accepted; formal security, product, and operations approval remains |
| Stage 1 — Extension foundation | In progress | Versioned records, private R2 storage, quarantine, validation, review, immutable publication, installation, cleanup, and audit exist; migration and failure gates remain |
| Stage 2 — Versioned themes | In progress | Standalone manifests, token validation, scoped CSS, public/dashboard preview, override-preserving upgrade/rollback, blocking, and uninstall exist; visual regression and full integration gates remain |
| Stage 3 — Declarative modules | In progress | Runtime navigation, an approved accessible component registry, translation fallback, tenant records, capability enforcement, dependency/conflict resolution, dependent-safe uninstall, and reversible migrations are implemented; controlled service capabilities, pilot acceptance, and full integration gates remain |
| Stage 4 — Marketplace operations | In progress | Publisher governance, release compatibility, explicit visibility, scoped permissions, signing, update policies, operational alerts, API telemetry, adoption health, emergency blocking, and incident response exist; the full marketplace end-to-end gate remains |
| Stage 5 — Isolated code extensions | Not started | No plugin SDK, isolated build, service deployment, or scoped plugin identity |

### Existing foundation — verified

- [x] Platform-wide catalog supports `MODULE`, `ADDON`, and `THEME` listings.
- [x] Per-school enablement is represented by `SchoolAddon`.
- [x] Backend routes can use `@RequiresAddon(...)` enforcement.
- [x] Frontend navigation can hide disabled compiled modules.
- [x] Platform administration requires `PLATFORM_ADMIN` and controlled unscoped access.
- [x] Tenant host resolution and JWT school matching protect school requests.
- [x] Prisma tenant scoping applies to tenant-owned records.
- [x] Theme configuration and custom CSS can be applied to school UI.
- [x] Privileged application actions have an audit subsystem available.

### Stage 0 — Product and architecture decisions

#### Publisher policy

- [x] Decide whether the first release is Wattaman-internal only.
- [x] Decide who may upload packages.
- [x] Decide who may review and publish packages.
- [x] Decide whether uploader and reviewer must be different users.
- [x] Define publisher suspension and package revocation policy.

#### Runtime model

- [x] Accept declarative runtime extensions as the first module model.
- [x] Accept the rule that uploaded code never executes in the primary NestJS or Next.js process.
- [x] Decide whether isolated code extensions are required in the initial product roadmap.
- [x] Select the first declarative module pilot.
- [x] Define the initial approved UI components and backend capabilities.

#### Storage and retention

- [x] Select the object-storage provider.
- [x] Define package and asset retention periods.
- [x] Define extension-data behavior on deactivate and uninstall.
- [x] Define package size and tenant storage quotas.
- [x] Decide whether antivirus or malware scanning is required before the first production release.

#### Commercial rules

- [x] Decide free, one-time, recurring, and manually invoiced plan support.
- [x] Decide whether overdue billing automatically disables an installation.
- [x] Decide whether schools install free extensions or request approval.
- [x] Separate technical runtime type from commercial catalog type.

#### Stage 0 completion gate

- [x] Every decision above has an `Accepted` entry in the decisions log.
- [x] The first theme milestone and first module pilot have named owners.
- [ ] Security, product, and operations stakeholders approve the architecture.

### Stage 1 — Versioned extension foundation

#### Database model

- [x] Add `Extension` model with stable immutable key.
- [x] Add immutable `ExtensionVersion` model.
- [x] Add tenant-scoped `ExtensionInstallation` model.
- [x] Add `ExtensionAsset` model or storage metadata contract.
- [x] Add `ExtensionPermission` model.
- [x] Add `ExtensionDependency` model.
- [x] Add structured `ExtensionValidation` results.
- [ ] Add `ExtensionAudit` lifecycle events or extend the current audit schema.
- [x] Add indexes and uniqueness constraints for keys, versions, schools, and installation state.

#### Package storage

- [x] Upload original ZIP to quarantine storage.
- [x] Calculate and persist SHA-256 checksums.
- [x] Store published artifacts immutably.
- [x] Extract approved assets into versioned storage paths.
- [x] Prevent public access to quarantined packages.
- [x] Add cleanup for abandoned or rejected uploads.

#### Server-side validation

- [x] Accept raw theme ZIP using multipart upload.
- [x] Limit compressed upload size.
- [x] Limit package file count.
- [x] Limit path depth.
- [x] Reject traversal, absolute paths, and duplicate normalized paths.
- [x] Apply a theme asset extension allowlist.
- [x] Limit stylesheet and referenced asset sizes.
- [x] Reject missing referenced assets.
- [x] Reject external CSS asset URLs.
- [x] Reject known unsafe CSS patterns.
- [x] Test a real generated theme ZIP fixture.
- [x] Detect MIME type from file content rather than extension only.
- [x] Validate image and font file signatures.
- [x] Add total extracted-size enforcement for every archive entry, including unreferenced files.
- [x] Add compression-ratio ZIP bomb detection before full extraction.
- [x] Explicitly detect and reject symlinks and unsupported ZIP entry types.
- [ ] Sanitize SVG if SVG support is introduced.
- [x] Produce structured validation errors and warnings.
- [ ] Run validation asynchronously with timeout, CPU, memory, and disk limits.

#### Lifecycle API and UI

- [x] Create upload-session API.
- [x] Create validation-status API.
- [x] Create structured validation-report UI.
- [x] Separate upload, approve, publish, install, and activate actions.
- [x] Add explicit rejection with reviewer notes.
- [x] Add permissions and compatibility review before publication.
- [x] Add lifecycle audit events for every privileged transition.
- [x] Add idempotency protection for upload and transition requests; identical package and completed transition retries return the existing result without repeating side effects.

#### Migration compatibility

- [x] Design backward-compatible migration from `AddonDefinition`.
- [x] Design migration from `SchoolAddon` to `ExtensionInstallation`.
- [ ] Preserve every existing extension key and school enabled state.
- [ ] Run old and new read paths in parallel behind a feature flag.
- [x] Add rollback procedures for each migration step.

#### Stage 1 tests

- [x] Focused theme package service tests pass.
- [x] Backend production build passes.
- [x] Frontend production build passes.
- [x] Controller multipart upload integration test passes.
- [ ] Validation lifecycle integration tests pass.
- [x] Tenant-isolation tests cover installation records.
- [x] Platform role tests reject school users and unauthenticated users.
- [ ] Storage failure and validation timeout tests pass.
- [ ] Migration rehearsal succeeds on a production-sized database copy.

#### Stage 1 completion gate

- [ ] Versioned package upload reaches quarantine storage.
- [x] Validation produces a persisted report without publishing automatically.
- [x] Invalid packages cannot be downloaded, published, or installed.
- [ ] Every lifecycle action is authorized and audited.
- [ ] Existing school modules and themes continue working unchanged.

### Stage 2 — Versioned theme lifecycle

#### Theme manifest

- [x] Finalize versioned `theme.json` JSON Schema.
- [x] Require key, name, version, manifest schema, and platform compatibility.
- [x] Validate mode, colors, fonts, radius, spacing, shadows, and surface tokens.
- [x] Validate asset references against extracted package files.
- [x] Decide and implement parent-theme inheritance; schema v1 intentionally supports standalone themes only and rejects parent declarations.
- [x] Decide and implement school-level override preservation.

#### Theme package contents

- [x] Accept one `style.css` at archive root or within one wrapping directory.
- [x] Inline approved referenced images and fonts into stored CSS.
- [x] Accept and validate `theme.json`.
- [x] Accept and sanitize `README.md`.
- [x] Accept and validate screenshots.
- [x] Move extracted assets from base64/database storage to object storage.
- [x] Scope all custom CSS beneath a Wattaman theme root.
- [x] Replace broad CSS freedom with approved tokens and selectors where possible.
- [x] Define behavior for unknown and unused files.

#### Version lifecycle

- [x] Upload theme as a draft immutable version.
- [x] Preview the exact draft artifact before publication.
- [x] Approve and publish a theme version.
- [x] Install a published version for selected schools.
- [x] Activate one installed theme version per school.
- [x] Upgrade while preserving approved school overrides.
- [x] Roll back to the previous installed version.
- [x] Deprecate a version without breaking current installations.
- [x] Emergency-block a compromised version.
- [x] Uninstall according to the accepted retention policy.

#### Preview safety

- [x] Render preview in an isolated frame or dedicated isolated route.
- [x] Prevent preview CSS from escaping into the platform admin interface.
- [x] Preview public pages and authenticated dashboards.
- [x] Preview light and dark modes.
- [x] Display validation warnings and compatibility information during preview.

#### Stage 2 tests

- [x] Manifest schema tests pass for valid and invalid versions.
- [x] CSS scoping and sanitization tests pass.
- [x] Asset storage and retrieval tests pass.
- [ ] Publish/install/activate authorization tests pass.
- [ ] Upgrade and rollback integration tests pass.
- [ ] School A cannot access or activate School B's installation.
- [ ] Visual regression checks cover representative public and dashboard pages.
- [x] Emergency blocking disables the affected version without redeployment.

#### Stage 2 completion gate

- [ ] A platform admin can upload, validate, preview, approve, and publish a theme ZIP.
- [ ] A published version can be installed and activated for one school.
- [ ] The school can upgrade and roll back without redeploying Wattaman.
- [ ] The full lifecycle appears in audit history.
- [ ] The old direct CSS upload endpoint is retired after migration.

### Stage 3 — Declarative module runtime

#### Module manifest

- [x] Finalize versioned `extension.json` JSON Schema.
- [x] Define roles, capabilities, dependencies, conflicts, and compatibility.
- [x] Define navigation, pages, forms, workflows, translations, and assets.
- [x] Validate all identifiers and reject unknown executable content.
- [x] Add a local package validator command for developers.

#### Dynamic navigation

- [x] Add backend endpoint returning resolved navigation.
- [x] Merge core and installed extension navigation.
- [x] Filter by school installation, role, permission, and feature state.
- [x] Replace static extension-key unions for runtime extensions.
- [x] Preserve compiled core navigation during migration.

#### Dynamic pages and UI

- [x] Add `/extensions/[extensionKey]/[pageKey]` route.
- [x] Build approved component registry.
- [x] Build schema-driven tables, forms, details, charts, filters, and actions.
- [x] Validate page definitions before publication.
- [x] Add translation fallback and accessibility requirements.
- [x] Prevent arbitrary React, browser script, HTML, and remote component execution.

#### Data and capabilities

- [x] Choose generic JSON records, generated tables, or another controlled model.
- [x] Ensure every extension-owned record includes `schoolId`.
- [x] Implement extension resource API namespace.
- [x] Enforce installation and requested capabilities on every request.
- [x] Add schema validation for resource data and actions.
- [x] Add rate limits and audit policies.
- [ ] Add controlled notifications, files, scheduled jobs, and external HTTP capabilities only when approved.
- [x] Prevent Prisma, raw SQL, filesystem, environment, and unrestricted network access.

#### Dependencies and upgrades

- [x] Resolve required and optional dependencies.
- [x] Detect dependency cycles and conflicts.
- [x] Prevent uninstall while dependents remain active.
- [x] Require approval when an upgrade requests new permissions.
- [x] Support declarative data migrations with rollback rules.

#### Pilot module

- [x] Select a low-risk pilot module.
- [ ] Define pilot acceptance criteria.
- [x] Package navigation, pages, permissions, data, and workflow in a ZIP.
- [ ] Install the pilot without changing or rebuilding Wattaman source.
- [x] Validate multi-school isolation and role behavior.
- [ ] Collect operator and school-admin feedback.

#### Stage 3 completion gate

- [ ] A new low-risk module installs from ZIP without source changes or rebuild.
- [x] It adds navigation and pages only for enabled schools and allowed roles.
- [ ] Its data is tenant-scoped and survives safe upgrades and rollback.
- [x] It cannot call undeclared capabilities.
- [x] Disabling it removes access without affecting core application startup.

Stage 3 validation note (2026-08-03): the Student Rewards artifact passes the local validator, all extension-focused unit suites pass, backend type-check/build passes, and the real tenant-isolation E2E suite passes 21/21 against PostgreSQL and the compiled backend. The suite proves extension navigation, role filtering, cross-school record isolation, tenant-owned creates, undeclared-capability rejection (with focused unit coverage), and immediate disable behavior.

Stage 3 dependency note (2026-08-03): declarative manifests now define required/optional dependency ranges and symmetric conflict checks. Publication rejects missing required packages, incompatible versions, and dependency cycles; install, upgrade, and activation require satisfied dependencies and no active conflicts; uninstall is blocked while an enabled dependent remains. Platform operators receive a dependency preflight before installation or upgrade. The extension suite passes 70 tests and both production builds pass.

Stage 3 data-migration note (2026-08-03): declarative manifests now support validated `renameField`, `setDefault`, and `removeField` operations for an exact source and target version. Upgrade applies record changes and byte accounting in a serializable transaction, stores per-record rollback backups, and records the migration run; rollback restores data and counters atomically and marks the run rolled back. `20260803000009_add_extension_data_migrations` was rehearsed successfully on PostgreSQL 16, and the extension suite passes 72 tests with backend type-check/build passing. The broad tenant upgrade/rollback E2E gate remains open.

Stage 3 UI-registry note (2026-08-03): declarative pages now render only approved stats, form, table, details, and chart components with schema-bound fields and actions, local filtering, create/update/delete workflows, semantic table markup, labels, alerts, and keyboard-native controls. Locale dictionaries use requested-locale then default-locale then literal-label fallback. Unknown components and roles are rejected, runtime endpoints have an extension-specific request limit, and writes/denials remain audited. The extension suite passes 75 tests and both production builds pass.

Migration rehearsal note (2026-08-03): `prisma migrate deploy` against an empty PostgreSQL 16 database fails because the repository's first recorded migration is additive and assumes the legacy tables already exist (`User` is the first missing relation). Runtime E2E validation used `prisma db push` only after preserving this failure as evidence. Stage 1 migration gates remain open until a baseline/adoption strategy supports both existing production databases and greenfield environments.

Publisher migration note (2026-08-03): `20260803000002_add_extension_publisher_governance` was applied successfully against PostgreSQL 16 with a legacy extension row. The rehearsal proved Wattaman publisher insertion, extension backfill, non-null enforcement, indexing, and foreign-key creation.

Publisher-permission migration note (2026-08-03): `20260803000003_add_publisher_members_and_reviews` was applied successfully against PostgreSQL 16 with an existing platform admin. The rehearsal proved scoped-role backfill and creation of append-only review history tables and constraints.

Extension-data migration note (2026-08-03): `20260803000004_add_extension_data_usage` was applied successfully against PostgreSQL 16 with existing JSON records. The rehearsal proved per-record byte backfill and exact installation usage totals. Runtime writes reserve quota atomically in serializable transactions, and expired uninstall cleanup deletes retained extension records after 30 days.

Package-signing migration note (2026-08-03): `20260803000005_add_extension_package_signing` was applied successfully against PostgreSQL 16. Ed25519 tests prove exact-byte signing, checksum verification, signature verification, tamper rejection, retired-key continuity, and irreversible revocation that blocks affected versions and installations.

Update and alert migration note (2026-08-03): `20260803000006_add_extension_update_policies` and `20260803000007_add_extension_operational_alerts` were applied successfully against PostgreSQL 16. The focused extension suite passes 55 tests, backend type-check/build and frontend production build pass, school policies enforce manual/notify/safe automatic behavior, and hourly alert scanning detects repeated validation failures and denied capabilities with operator acknowledgement and resolution.

Marketplace operations migration note (2026-08-03): `20260803000008_add_extension_visibility_and_api_metrics` was applied successfully against PostgreSQL 16 with listed/unlisted backfill verification. Release notes and platform ranges are required before review and exposed as a compatibility matrix; listed, unlisted, and private visibility with per-school grants are enforced; extension API success/error counts and latency are collected hourly and shown to operators. The extension suite passes 62 tests, backend and frontend production builds pass, and the real two-school HTTP/PostgreSQL tenant suite passes 21/21. The broad Stage 4 workflow gate remains open until one real artifact is exercised through the complete publisher-to-emergency lifecycle in a single E2E scenario.

Theme safety note (2026-08-03): theme packages now validate color, font, radius, spacing, shadow, and surface tokens; reject CSS outside the approved selector registry; rewrite accepted rules beneath `.wattaman-theme`; and render isolated light/dark public-site and authenticated-dashboard previews with compatibility and validator warnings. The extension suite passes 64 tests and both production builds pass.

Theme override note (2026-08-03): theme manifest v1 is explicitly standalone and rejects undeclared parent inheritance. Activation records the exact package-applied appearance; upgrade compares current school settings against that snapshot, preserves only changed school overrides, applies the new package beneath them, and retains the same overrides during rollback. The extension suite passes 77 tests and backend type-check/build passes. Visual regression and complete real-storage lifecycle gates remain open.

### Stage 4 — Marketplace and operations

#### Publisher and review

- [x] Add publisher identity and status.
- [x] Add uploader, reviewer, publisher, and publisher-management permissions.
- [x] Enforce separation of duties if accepted in Stage 0; the accepted initial internal policy explicitly allows one staff member to hold multiple scoped roles.
- [x] Add review queue, reviewer notes, approval, rejection, and appeal history.
- [x] Add release notes and compatibility matrix.

#### Distribution and updates

- [x] Add listed, unlisted, private, deprecated, retired, and blocked states.
- [x] Add school update policies: manual, notify, and approved automatic updates.
- [x] Show requested permission differences before upgrade.
- [x] Show version adoption and schools affected by deprecation or blocking.
- [x] Prevent mutation of published artifacts.

#### Monitoring and response

- [x] Add validation, installation, activation, upgrade, and rollback metrics.
- [x] Add extension API error and latency metrics.
- [x] Add storage and data usage metrics.
- [x] Add version health dashboard.
- [x] Add emergency global version kill switch.
- [x] Add operator runbook for compromised packages.
- [x] Add alerts for repeated failures and suspicious capability use.

#### Package signing

- [x] Define publisher key management.
- [x] Sign trusted package versions.
- [x] Verify signatures before publication and installation.
- [x] Define key rotation and revocation.

#### Stage 4 completion gate

- [ ] Publisher, review, publication, update, and emergency workflows operate end to end.
- [x] Operators can identify every school using a version.
- [x] A compromised version can be blocked globally and audited.
- [x] Published artifacts and review history are immutable.

### Stage 5 — Isolated executable extensions

This stage is optional until Stage 0 explicitly accepts it. It must not begin merely because declarative modules cannot support one requested feature.

#### SDK and contracts

- [ ] Define plugin service API and event contracts.
- [ ] Define scoped service identity and capability tokens.
- [ ] Define health, readiness, timeout, retry, and idempotency requirements.
- [ ] Define compatible SDK versions and deprecation policy.
- [ ] Provide local development and contract-test tooling.

#### Build isolation

- [ ] Build packages in isolated disposable containers.
- [ ] Remove production secrets and production network access from builds.
- [ ] Scan source, dependencies, licenses, malware, and vulnerabilities.
- [ ] Produce signed immutable deployment artifacts.
- [ ] Require manual review before deployment.

#### Runtime isolation

- [ ] Deploy each code extension as a separate service or worker.
- [ ] Prevent direct access to the primary database.
- [ ] Prevent access to other extension services by default.
- [ ] Enforce CPU, memory, time, storage, and network limits.
- [ ] Restrict outbound network access to approved destinations.
- [ ] Rotate and revoke service credentials.
- [ ] Isolate failures from Wattaman application startup and request handling.

#### Operations

- [ ] Add deployment, health, logs, metrics, and trace visibility.
- [ ] Add canary release and rollback.
- [ ] Add global and per-school disable controls.
- [ ] Test service compromise and credential-revocation procedures.

#### Stage 5 completion gate

- [ ] An internally developed code extension passes the isolated build pipeline.
- [ ] It deploys separately with no database credentials.
- [ ] It accesses only approved tenant-scoped APIs and capabilities.
- [ ] Its failure or compromise can be isolated and disabled without redeploying Wattaman.

### Cross-stage release checklist

Run this checklist before declaring any extension stage production-ready:

- [ ] Requirements and accepted decisions match the implementation.
- [ ] Threat model is updated.
- [ ] Database migration and rollback are rehearsed.
- [ ] Tenant-isolation tests pass.
- [ ] Authentication, role, permission, and capability tests pass.
- [ ] Package validation and malicious-input tests pass.
- [ ] Audit events are complete and immutable enough for investigation.
- [ ] Error handling does not leak secrets or cross-school information.
- [ ] Rate limits and resource limits are configured.
- [ ] Backup, restore, rollback, and emergency-disable procedures are tested.
- [ ] Backend tests and production build pass.
- [ ] Frontend production build passes.
- [ ] Documentation and operator runbooks are updated.
- [ ] Monitoring and alerts are active.
- [ ] Manual acceptance test is signed off.

### Immediate next TODOs

Complete these in order before expanding module functionality:

1. [ ] Resolve and record the Stage 0 decisions.
2. [ ] Finalize the `theme.json` schema and supported archive contents.
3. [ ] Add extension/version/installation/validation database design and migration review.
4. [ ] Select object storage and design quarantine paths.
5. [ ] Persist original ZIP checksum and structured validation results.
6. [ ] Add upload, validation report, review, and publish lifecycle states.
7. [ ] Add content-based MIME checks and complete ZIP bomb protections.
8. [ ] Add multipart controller and authorization integration tests.
9. [ ] Implement isolated theme preview.
10. [ ] Implement versioned install, activate, upgrade, and rollback.
11. [ ] Retire the legacy direct CSS upload only after migration.
12. [ ] Select and specify the first declarative module pilot.
