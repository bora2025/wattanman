# Wattaman 1,000-School Reform — Implementation TODO

Companion roadmap: `docs/platform-1000-schools-roadmap.md`

## Status Rules

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and verified
- `[!]` Blocked; document the blocker directly under the item

An item is complete only when implementation, automated tests, documentation, deployment validation, and rollback guidance are finished.

## Stage 0 — Architecture Baseline

### Project cleanup

- [x] Inventory every remaining Prisma model and classify it as core, extension-platform, migration-only, or obsolete.
- [x] Identify retained services that still access removed feature models.
- [x] Export any legacy data that must be retained.
  - No export is required: the product owner explicitly requested deletion of all legacy module data.
- [x] Remove obsolete feature models from `prisma/schema.prisma`.
- [ ] Create and rehearse the destructive cleanup migration against a production-sized backup.
- [x] Remove obsolete dependencies, environment variables, scripts, and documentation.
- [x] Update the root architecture documentation and directory map.

### Architecture decisions

- [x] Record an ADR for tenant domain resolution.
- [x] Record an ADR for PostgreSQL row-level security.
- [x] Record an ADR for Redis and durable queue technology.
- [x] Record an ADR for API, worker, and migration service separation.
- [x] Record an ADR for declarative extension API v1.
- [x] Record an ADR for backup retention and deletion policy.
- [x] Approve SLO, RPO, RTO, and capacity assumptions.
- [x] Assign accountable owners for platform, marketplace, runtime, infrastructure, security, and reliability.

### Stage 0 gate

- [x] Backend production build passes.
- [x] Frontend production build passes.
- [x] Extension lifecycle tests pass.
- [x] No unexplained legacy runtime file or database model remains.
- [ ] Architecture and security review is approved.

## Stage 1 — Tenant Safety and Provisioning

### Domain model

- [x] Add `SchoolDomain` with hostname, school, type, verification state, token, and timestamps.
- [x] Add unique normalized-hostname constraint.
- [x] Add managed-subdomain and custom-domain support.
- [x] Add domain verification workflow.
- [x] Add TLS/readiness state visible to platform administrators.
- [x] Migrate existing school subdomains into `SchoolDomain` records.

### Tenant resolver

- [x] Replace first-label host parsing with exact verified-domain lookup.
- [x] Remove the single-school fallback.
- [x] Reject unknown and unverified hosts.
- [x] Normalize forwarded host headers safely.
- [x] Add trusted-proxy configuration.
- [x] Add cache with explicit domain-change invalidation.
- [x] Preserve JWT `schoolId` versus host `schoolId` enforcement.

### Database isolation

- [x] Create separate migration, control-plane, school-runtime, and analytics database roles.
- [x] Add a transaction-local tenant identifier.
- [x] Enable row-level security on every tenant-owned core table.
- [x] Add deny-by-default RLS policies.
- [x] Restrict unscoped operations to audited platform paths.
- [x] Verify background jobs explicitly establish tenant scope.
- [x] Add school ID to every tenant-owned unique key and index where required.
  - An automated schema-registry test now fails when any model carrying `schoolId` is missing from tenant query enforcement.

### Isolation tests

- [x] Add two-school fixtures with overlapping email, names, and extension keys.
- [x] Test cross-school reads for every retained controller.
- [x] Test cross-school writes and deletes.
- [x] Test forged host headers.
- [x] Test valid token on wrong school domain.
- [x] Test platform-scope authorization.
- [x] Test tenant isolation in extension records, assets, metrics, and jobs.
- [x] Add tenant isolation tests to required CI checks.

### Provisioning workflow

- [x] Add school lifecycle states: `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `DELETION_SCHEDULED`, `DELETED`.
- [x] Add idempotent provisioning job model.
- [x] Create the school and first administrator transactionally.
- [x] Create only base settings and storage prefixes.
- [x] Do not create module or extension installation rows by default.
- [x] Add provisioning retry and failure recovery.
- [x] Add provisioning status UI for platform administrators.
- [x] Add onboarding notification after readiness checks pass.

### Stage 1 gate

- [x] Provision 1,000 synthetic schools without manual intervention.
- [x] No tenant-isolation test failure.
- [x] Unknown hosts fail closed.
- [x] Provisioning retries create no duplicate schools, users, or domains.

## Stage 2 — Production Deployment Foundation

### Release process

- [x] Remove migration execution from API startup.
- [x] Remove production seed execution from API startup.
- [x] Create a dedicated migration release command or service.
- [x] Protect migrations with a PostgreSQL advisory lock.
- [x] Add schema compatibility check before application rollout.
- [x] Adopt expand-and-contract migration rules.
- [x] Document rollback and roll-forward procedures.

### Redis and queues

- [x] Select managed Redis provider and deployment topology.
- [x] Select queue library and persistence model.
- [x] Define job envelope, version, tenant context, trace ID, and idempotency key.
- [x] Add retry policy with exponential backoff and jitter.
- [x] Add dead-letter queue and replay controls.
- [x] Add distributed locks for school and extension operations.
- [x] Add job heartbeat and ownership lease.
- [x] Add queue-depth and oldest-job alerts.

### Service separation

- [x] Keep frontend and API stateless.
- [x] Create extension worker process.
- [x] Create operations worker process.
- [x] Create notification worker process.
- [x] Move scheduled jobs out of the API process.
- [x] Ensure workers use explicit tenant context.
- [x] Add graceful shutdown for API and workers.
- [x] Add separate liveness and readiness endpoints.

### Distributed protection

- [x] Replace process-local throttling with Redis-backed rate limits.
- [x] Rate limit by IP, user, school, extension, and sensitive action.
- [x] Add idempotency storage for mutating APIs.
- [x] Add request size and response size limits.
- [x] Add cursor pagination requirements.
  - Verified by the 17-route collection registry, 195 backend tests, both production builds, and Railway deployment `bf11d7b0-5abe-4e0c-b299-2cd08e70a675` readiness on 2026-08-11.
- [x] Add circuit breakers for R2, email, SMS, and external integrations.
  - Redis-shared protection covers R2, SendGrid, Twilio, Railway GraphQL, and external image fetches; 201 backend tests, both builds, and Railway deployment `2de1f553-7638-4c9f-ac99-f880af8f185b` passed on 2026-08-11.

### Stage 2 gate

- [x] Run at least three API replicas safely.
  - Railway deployment `6787d681-d942-46fa-a11f-2e7d26de6641` reports three Southeast Asia replicas; 20/20 production readiness requests passed on 2026-08-11.
- [x] Prove only one migration job executes.
  - Two concurrent production runners serialized on advisory lock `864220261`; evidence is recorded in `docs/stage-2-validation.md`.
- [x] Prove scheduled jobs do not duplicate.
  - Every cron path has a Redis time-bucket claim; independent-replica contention and loser no-side-effect tests pass, and three-replica deployment `ee0859e9-1882-4f38-9acb-176bff0f39e5` is ready.
- [x] Complete a rolling deployment without incompatible-schema errors.
  - Three-replica redeploy `15c77d65-c3a3-4f05-b468-ffab9f9373c1` completed with 26/26 continuous readiness probes and no compatibility error.
- [x] Recover and replay a dead-letter job successfully.
  - A real Redis/BullMQ failure-to-dead-letter-to-replay rehearsal passed; audited platform controls shipped in deployment `2d348bda-ecbd-4255-b725-b7aadcd01fae`.

## Stage 3 — Marketplace Production Hardening

### Catalog and publisher UX

- [x] Finalize extension categories, tags, locales, support links, privacy policy, and data-use fields.
  - Controlled metadata, audited editing, school-facing disclosures, clean PostgreSQL migration rehearsal, 215 backend tests, both production builds, and Railway deployments `2b2627b2-d9b1-45ed-b2d2-8668d8afc8eb` (API) and `530d4350-8813-4a25-87c3-24212b62e47e` (frontend) passed on 2026-08-11.
- [x] Add publisher onboarding and verification.
  - External publishers are suspended pending independent verification; self-verification and unverified activation fail closed. The 217-test backend suite, both builds, clean 32-migration rehearsal, and Railway deployments `42c88ae7-5dd7-4a2b-9933-8e552627677c` (API) and `26b4ed61-df9b-4c5f-bdb9-9052e0a06d51` (frontend) passed on 2026-08-11.
- [x] Add publisher member role management.
  - Managers can add members by email, edit `UPLOAD`/`REVIEW`/`PUBLISH`/`MANAGE` roles, and suspend/reactivate access; last-manager removal is rejected. The 219-test backend suite, both builds, and Railway deployments `e51cdb36-a165-4aba-962a-d6e00530196d` (API) and `67ae9a6c-c3f0-455d-9db5-51947bb91dd2` (frontend) passed on 2026-08-11.
- [x] Add key registration, rotation, retirement, and revocation UX.
  - Fingerprinted key registration rejects duplicates, rotation overlaps active keys, configured-key retirement fails closed, and emergency revocation blocks affected releases/installations. The 221-test backend suite, both builds, and Railway deployments `e11d5f09-03cf-40aa-ae82-bde057f49f57` (API) and `b6a06117-ca06-4184-9f5a-dc2276bc42e6` (frontend) passed on 2026-08-11.
- [x] Add catalog search, filters, sort, pagination, and featured collections.
  - Server-side search and filters use sort-bound opaque cursors; school UX pages 24 results and platform-curated locale collections remain tenant-visible only. The 226-test backend suite, both builds, clean 33-migration rehearsal, and Railway deployments `96eb4102-52da-46a6-8ec3-c0ae13005e78` (API) and `59216aae-772c-43ba-857f-da7b503c0ac1` (frontend) passed on 2026-08-11.
- [x] Separate school marketplace and installed-extension management pages.

### Package pipeline

- [x] Make upload completion asynchronous and idempotent.
  - Upload requests return `202` after checksum-addressed quarantine persistence, create a deterministic pending validation, and enqueue one checksum-bound BullMQ job. Retries reuse the same validation and job identity; the dedicated production extension worker downloads and verifies the object before validation. The 231-test backend suite, both builds, and Railway deployments `99093b1a-7f6a-4041-90ae-2c88be5db0b7` (API), `05efe9ac-f515-4fb0-960a-a997742feb93` (frontend), and `9cb376f3-0312-4f2a-b327-3d616b0816d6` (extension worker) passed on 2026-08-11.
- [x] Enforce immutable checksum-addressed R2 keys.
  - Quarantine ZIPs, validated assets, and published ZIPs use SHA-256-addressed keys plus signed `If-None-Match: *` create-only writes. A `412` retry succeeds only after the stored bytes match the expected checksum; mismatches fail closed. The 235-test backend suite, both builds, and Railway deployments `066ff4e0-86c8-4b28-ae6b-08dca4e472ca` (API) and `28b04468-a62f-4976-b973-0c26c7abe0ca` (extension worker) passed on 2026-08-11.
- [x] Add antivirus scanning.
  - The extension worker streams every quarantined ZIP to private ClamAV 1.4 before archive parsing, rejects detected signatures as `MALWARE_DETECTED`, retries scanner outages, and refuses startup unless a real empty-stream scan succeeds. The 239-test backend suite, both builds, and Railway deployments `61857840-3eca-4ad5-9205-d25064311c8b` (API), `11aac888-8f98-45ab-a756-cd2f48a082f6` (extension worker), and `3ee08ffa-632d-4c7b-89c5-6ab10fed4cbd` (ClamAV) passed on 2026-08-11.
- [x] Enforce expanded-size, file-count, path, symlink, MIME, and compression-ratio limits.
  - Validation rejects more than 200 files or 250 entries, files over 5MB, packages over 10MB expanded, ratios over 100:1, unsafe/control/overlong paths, normalized duplicates, symlinks, executables, unsupported extensions, and MIME/signature mismatches before dangerous extraction. Malicious ZIP fixtures, the 244-test backend suite, both builds, and Railway deployments `0c14f8a8-4b13-40ee-8bdb-1e93295ef0f0` (API) and `2de93e14-eba7-4f23-865b-87c54c7e6b27` (extension worker) passed on 2026-08-11.
- [x] Validate manifest against versioned JSON Schema.
  - Theme and declarative-module manifest v1 contracts compile under strict JSON Schema draft 2020-12 with Ajv, ship inside worker builds, permit only controlled fields plus `x-` metadata, and produce structured schema errors before semantic cross-reference validation. The 248-test backend suite, both builds, and Railway deployments `b24c0a87-ea49-4537-91d8-417e8e9358c8` (API) and `4c67e994-e33c-4175-9c3c-215a5a0deaa1` (extension worker) passed on 2026-08-11.
- [x] Record validation tool versions and reports.
  - Every validation stores report schema v1, pipeline version, isolated runner, package validator, manifest schema, Ajv, JSZip, ClamAV engine, and ClamAV signature database versions alongside structured errors and warnings; platform administrators can inspect provenance in the release UI. The clean 34-migration rehearsal had zero drift, the 249-test backend suite and both builds passed, and Railway deployments `04cba07a-a472-4fa6-868d-ef8d6321489e` (API), `9ea185cc-cf32-4b4c-8b5f-6ccc5b5d79f6` (frontend), and `12d5eee6-efa7-4e10-aa61-416fddf0baec` (extension worker) succeeded on 2026-08-11.
- [x] Sign only approved immutable packages.
  - Publication signing independently requires an `APPROVED`, previously unsigned release whose ZIP remains at its exact extension/version/checksum quarantine key; it then verifies the bytes, active publisher key, and private/public Ed25519 match before persisting a signature. The 250-test backend suite and both builds passed, and Railway API deployment `8b477c13-c261-4f74-93f4-762e1c64f816` succeeded on 2026-08-11.
- [x] Verify signatures before installation and runtime cache use.
  - Install, upgrade, rollback, activation, navigation, pages, and extension data operations fail closed unless non-core package bytes match their immutable published key, SHA-256, Ed25519 signature, lifecycle state, and non-revoked key. Runtime verification caches only the complete signed identity for five minutes and rechecks lifecycle/key status before every cache hit. The 252-test backend suite and both builds passed, and Railway API deployment `76905dd2-5fcb-4004-a6bc-c4a0c9c2c1e5` succeeded on 2026-08-11.
- [x] Add quarantine and rejected-package retention policies.
  - A distributed daily cleanup expires abandoned quarantine/validation work after seven days, preserves a structured failed validation trail, retains rejected bytes for 30 additional days, then deletes package/assets in bounded retry-safe batches while preserving checksums and reports. Retired releases are excluded. The 254-test backend suite and both builds passed, and Railway deployments `f92c1323-cf28-418a-bd53-5aacb7469756` (API) and `abc447d6-2542-4ee7-98a9-131e189bef99` (extension worker) succeeded on 2026-08-11.

### Review and publication

- [x] Enforce uploader/reviewer separation when required.
  - Approval and rejection require a verifiable reviewer identity different from the recorded uploader whenever policy is enabled; production defaults to separation, with an explicit environment override only for an accepted single-operator workflow. Existing scoped publisher roles and review-note requirements remain independent gates. The 255-test backend suite and both builds passed, and Railway API deployment `4b2255b2-ff7c-4e09-b5d8-9259023014a2` succeeded on 2026-08-11.
- [x] Add structured technical, permission, privacy, and compatibility review.
  - Review summaries expose validator evidence, capability deltas, privacy/data-use declarations, and platform compatibility. Reviewers must record PASS/WARN/FAIL plus notes for all four domains; approvals cannot contain failures and rejections must identify one. Assessments are append-only review-event JSON and the platform UI provides an in-page decision form. A clean 35-migration rehearsal had zero drift, the 256-test backend suite and both builds passed, and Railway deployments `9307aa79-d30f-4534-b0fc-58801df643b4` (API) and `2a75a813-90ca-473e-84dd-e1c67df6540b` (frontend) succeeded on 2026-08-11.
- [x] Require review notes for every decision.
  - Approval and rejection require overall decision notes plus non-empty notes for every structured review domain; rejection appeals already require an explanation. Missing notes fail before lifecycle mutation, and append-only review events retain the actor, role, decision, assessment, and timestamp.
- [x] Add appeal workflow and audit history.
  - Only an active publisher uploader can appeal a reviewer rejection with mandatory notes. A conditional transaction atomically claims the rejected state, clears the prior decision, requeues review, and appends an APPEALED event linked to the prior reviewer; concurrent retries fail without duplicate history. Cursor-paged history and the platform UI expose decision actors and structured domain outcomes, while audit logs retain appeal metadata. The 257-test backend suite and both builds passed, and Railway deployments `0eb6c06e-4cc7-4fd3-975a-a0a655476604` (API) and `c388440d-2ad9-49f6-a7c2-0dcb06d578af` (frontend) succeeded on 2026-08-11.
- [x] Add publication checklist.
  - A server-generated checklist verifies approved state, passing validation, complete structured review, separation policy, immutable package identity/size, release notes, compatibility, active publisher, active signing configuration, and dependency graph before any signing or publication side effect. The platform UI displays every check and disables Publish until ready; dependency blockers retain specific diagnostics. The 258-test backend suite and both builds passed, and Railway deployments `44ee13c3-d166-46cf-862f-fb7ea479639b` (API) and `f495805b-5a07-4e5b-9d55-dc4559c63e78` (frontend) succeeded on 2026-08-11.
- [x] Add deprecate, delist, emergency block, retire, and purge controls.
  - Publisher-scoped controls now require reasons for delisting, deprecation, blocking, retirement, and purge. Emergency block disables active installations; retiring the last releasable version retires and unlists the extension; permanent purge requires an unlisted retired extension, only terminal releases, no active installation, and successful R2 deletion before database removal. Core extensions retire instead of physical deletion. The 261-test backend suite and both builds passed, and Railway deployments `a5696277-6eeb-45c1-abe1-4cd1d1290776` (API) and `24e884d9-7d12-4232-967c-a57e1d1f72d2` (frontend) succeeded on 2026-08-11.

### Commercial workflow

- [x] Finalize free, one-time, subscription, and private-contract models.
  - Extensions now use database-constrained `FREE`, `ONE_TIME`, `SUBSCRIPTION`, and `PRIVATE_CONTRACT` pricing with integer minor units, ISO currency, monthly/yearly intervals, and mandatory private-contract references. School requests are routed by model and preserve immutable request-time commercial terms; activation requires active billing for every explicit non-free model. Platform and school interfaces edit and display exact terms without relying on floating-point legacy prices. A clean 36-migration rehearsal had zero drift, the 271-test backend suite and both builds passed, and Railway deployments `ae296b94-932f-4429-a385-84fc64d1a9b9` (API) and `af4f7632-d44d-44f8-91f9-356b202a42ee` (frontend) succeeded on 2026-08-11.
- [x] Auto-fill school and administrator information in extension requests.
  - Every free, paid, subscription, and private-contract request now resolves the school from authoritative tenant context and the administrator from the authenticated actor, rejects missing identities, and snapshots school name plus administrator name/email onto the request for durable platform review and audit history. The 271-test backend suite and backend build passed, and Railway API deployment `ada4fb54-3ebf-4964-bfa2-3a1093833206` succeeded on 2026-08-11.
- [ ] Add payment evidence upload through signed URLs.
  - Implementation is deployed: five-minute checksum-bound SigV4 PUT/GET URLs, authenticated object verification, exact request snapshots, and direct school/platform UI transfers passed a real private-R2 probe plus the 275-test suite. Production browser activation remains pending because the current object-only R2 token cannot apply bucket CORS (`PutBucketCors` returns `403 AccessDenied`); `backend/scripts/configure-r2-cors.js` and `docs/r2-browser-cors-policy.example.json` are ready for a bucket-policy-capable credential or dashboard application.
- [x] Add platform QR/bank payment settings and rotation history.
  - Every bank/account/QR change now atomically increments a version and appends an immutable history snapshot while retaining prior private QR objects. The platform UI displays the active setting and the latest 20 historical versions, historical QR retrieval is platform-only, currency and version shapes are database constrained, and the pre-existing setting is backfilled as version 1. A clean 38-migration rehearsal had zero drift, the 276-test backend suite and both builds passed, and Railway deployments `ed5ea760-8907-4d33-b722-ea2d9dcb11f0` (API) and `b5e7d299-f585-4782-b82d-28de0fc88703` (frontend) succeeded on 2026-08-11.
- [x] Add request, payment-review, approval, installation, and activation states.
  - Installations now persist a constrained `REQUESTED`, `PAYMENT_REVIEW`, `APPROVED`, `INSTALLED`, `ACTIVE`, or `UNINSTALLED` lifecycle state with deterministic legacy backfill. Every request/reset, evidence finalization, approval, install, activation/deactivation, uninstall, emergency block, key revocation, and publisher suspension keeps state and timestamps aligned. Both admin interfaces render/filter authoritative state with rolling-deploy fallback. A clean 39-migration rehearsal had zero drift, the 278-test backend suite and both builds passed, and Railway deployments `b0ae7d67-16f9-44b4-9731-a0f604b4023b` (API) and `97230f90-3031-4898-ab85-3d8bb5ba0e92` (frontend) succeeded on 2026-08-11.
- [x] Separate payment approval from installation and activation.
  - Billing review, request approval, package installation, and runtime activation remain separate audited endpoints and state transitions. Non-free approval requires active billing; one-time/subscription approval additionally requires submitted evidence. Install requires `APPROVED`, activation requires `INSTALLED`, non-active billing cannot silently deactivate an active extension, and the platform UI disables out-of-order controls.
- [x] Add payment evidence retention and access policy.
  - Payment submissions now create append-only, tenant-scoped evidence records with SHA-256 integrity metadata, configurable 30-to-3650-day retention (`EXTENSION_PAYMENT_EVIDENCE_RETENTION_DAYS`, default 2555 days), explicit legal holds, audited short-lived reviewer download URLs, and no legacy API proxy download. Storage-first cleanup atomically claims expired evidence, retries failed R2 deletion without losing metadata, blocks installation/extension deletion while objects remain retained, and preserves checksum/size/audit history after purge. A clean 40-migration rehearsal had no schema drift; 283 backend tests and both production builds passed. Railway deployments `ca702366-3a83-4099-8d1a-0a620174bc68` (API), `a5488d0a-e1b4-477d-ade7-460b11991c31` (frontend), and `d8dd7fb7-c65f-4676-9f8e-88e713d0d431` (extension worker) succeeded on 2026-08-11.

### Installation workflow

- [x] Add installation command idempotency keys.
  - Install, upgrade, rollback, activation, uninstall, school-history purge, and permanent extension purge now reject missing `Idempotency-Key` headers. Redis-backed, tenant/actor/route-scoped reservations prevent cross-replica duplication, reject payload-changing key reuse and concurrent processing, replay completed responses for 24 hours, and release failed commands for safe retry. The shared web client creates one safe key per mutation and preserves it across token-refresh retry. All 284 backend tests and both production builds passed; Railway deployments `07541492-7745-4821-9cd2-03ce0d3156a4` (API) and `07d8dc78-3c6d-4767-976b-d1f1ab414429` (frontend) succeeded on 2026-08-12.
- [x] Add distributed school/extension locks.
  - Every install, upgrade, rollback, activation, uninstall, installation-history purge, and permanent extension purge now holds a Redis `SET NX PX` lease for the complete command. Installation routes resolve to one canonical school/extension resource key, so different installation IDs cannot bypass contention; extension-wide purge has its own global resource key. Locks use random ownership tokens, configurable bounded TTL (`EXTENSION_COMMAND_LOCK_MS`, default 120 seconds), compare-and-delete release, fail-fast contention, and guaranteed release after command failure. Production requires the private Redis URL. All 287 backend tests and the backend build passed; Railway API deployment `ccf00ddf-0659-47d2-9cbb-63804c01b5dd` succeeded on 2026-08-12.
- [x] Convert install, update, rollback, uninstall, and purge to jobs.
  - Durable `ExtensionLifecycleJob` records and BullMQ execution now cover install, upgrade, rollback, activation, deactivation, uninstall, installation purge, and extension purge. Commands retain actor, payload, attempts, progress, result, and failure details, and survive API restarts.
- [x] Add progress and failure details to both admin interfaces.
  - Platform and school extension pages poll lifecycle-job state, show active progress, terminal failures, and recent command history without requiring a page reload.
- [x] Add retry-safe storage and database operations.
  - Lifecycle commands combine idempotency keys, distributed locks, durable jobs, bounded retries, idempotent missing-object R2 deletes, transactional scheduled purges, and durable pending purge-report delivery. All 303 backend tests and both production builds passed on 2026-08-13.
- [x] Add uninstall grace period and scheduled purge.
  - Uninstall marks data for purge after the bounded `EXTENSION_UNINSTALL_GRACE_DAYS` policy; the extension worker performs scheduled, batched, tenant-scoped cleanup after payment-evidence retention requirements are satisfied.
- [x] Add signed purge report.
  - Manual and scheduled purges create immutable Ed25519-signed reports in private R2. Scheduled report payloads are committed in the same transaction as deletion, pending uploads retry automatically, and only delivered reports are downloadable. Railway deployments `b27bb181-ee4c-404a-a163-a11ecc03320b` (API), `aac1477c-ed4d-4fca-accc-330469781da0` (frontend), and `a970fa77-cbe3-416d-b57f-6b96a89f8110` (extension worker) succeeded with 43 migrations on 2026-08-13.

### Stage 3 gate

- [x] Lifecycle retries create no duplicate release or installation.
  - Idempotency-key replay returns the existing durable job, payload-changing reuse fails, completed-job replay returns the stored result without invoking installation work, and canonical distributed locks serialize school/extension commands.
- [x] Malicious ZIP test suite passes.
  - Validator tests reject traversal, excessive entries, symlinks, ZIP bombs, oversized expansion, executable files, MIME spoofing, unsafe CSS, unsafe Markdown, and malformed manifests.
- [x] Signing and key-revocation tests pass.
  - Publication, immutable checksums, standalone Ed25519 verification, tamper rejection, key retirement/revocation, rotation, and affected-installation blocking are covered.
- [x] Marketplace request appears reliably for platform administrators.
  - Request creation snapshots the authoritative tenant school/admin and billing terms; the unfiltered platform installation queue explicitly retains `REQUESTED` rows. The focused Stage 3 gate suite passed 123 tests on 2026-08-13.
- [x] Security review approves package handling.
  - `docs/stage-3-package-security-review.md` approves internal declarative modules/themes against the current threat model while explicitly withholding approval for executable extensions and public external-publisher launch.

## Stage 4 — Declarative Extension Runtime V1

### Manifest API

- [x] Freeze extension manifest v1.
  - Strict JSON Schema draft 2020-12 plus semantic validation defines declarative module v1. A fixed SHA-256 contract test prevents silent edits to the frozen schema bytes and requires future breaking work to introduce a new schema version.
- [x] Freeze theme manifest v1.
  - Theme v1 has an independently fingerprinted, strict schema with standalone inheritance, closed mode/token values, approved assets, and scoped CSS safety rules.
- [x] Publish compatibility and deprecation policy.
  - `docs/extension-manifest-v1-contract.md` defines additive compatibility, breaking-change criteria, immutable release semantics, a 24-month successor support window, 180-day rejection notice, and audited emergency blocking.
- [x] Define navigation, page, component, field, validation, action, and permission contracts.
  - The v1 contract documents the closed component/action registry, cross-reference rules, typed fields, unknown-input rejection, server authorization boundary, and capability semantics already enforced by schema, package validator, runtime API, and renderer.
- [x] Define locale and accessibility requirements.
  - Locale fallback, plain-text translations, literal fallback labels, accessible names, semantic tables/forms, keyboard-native controls, focus/script/CSS restrictions, and responsive publisher testing are normative v1 requirements.
- [x] Define extension-owned record schema rules.
  - The contract fixes tenant/extension/version/installation/resource ownership, server-owned metadata, typed JSON validation, capability-only access, cursor bounds, quotas, migration backups, grace retention, and signed purge behavior. The focused contract suite passed 33 tests and the backend production build on 2026-08-13.

### Runtime UI

- [x] Build approved component registry.
  - `extension-ui-registry.ts` is the server authority for the closed v1 component, property, action, role, and field-type sets used by package validation; the renderer implements the same five typed components.
- [x] Deny unknown components and properties.
  - Strict manifest JSON Schema denies unknown properties, while semantic validation checks every component against its registry-specific property and action allowlists before publication.
- [x] Enforce safe links, images, CSS, and content.
  - V1 components expose no arbitrary link, image, HTML, or script properties; React escapes record/translation content, package MIME/path rules protect assets, and theme CSS is selector/declaration allowlisted and namespace-scoped.
- [x] Add loading, empty, error, permission-denied, and offline states.
  - The live extension route now has explicit polite loading, table-empty, retryable error, distinct 401/403 permission denial, and offline messaging rather than collapsing all failures into one alert.
- [x] Add responsive and keyboard-accessibility tests.
  - Playwright exercises the real Next.js extension route with mocked authenticated APIs at 390×844 and 1280×720, asserts no horizontal overflow and an empty state, and verifies keyboard focus order across labeled fields and the primary action.
- [x] Add theme preview and runtime isolation tests.
  - Deterministic Chromium pixel baselines continue to verify dashboard/public surfaces in light/dark modes, alongside the new route-level state tests. All 19 focused backend tests, six Playwright tests, and both production builds passed on 2026-08-13.

### Runtime APIs and data

- [x] Add capability-based extension API gateway.
  - Every runtime read/write resolves an active signed installation, requires the manifest's `<resource>:read|write` capability and an allowed page role, audits capability denial, and exposes no database or arbitrary service access.
- [x] Scope every operation by school, extension, version, and installation.
  - Records now persist authoritative `schoolId`, `extensionId`, `installationId`, and `versionId`; all collection and mutation predicates include the active installation plus extension/resource, while tenant middleware and RLS enforce school scope.
- [x] Add record schema version and optimistic concurrency version.
  - Records persist manifest `schemaVersion` and monotonic `concurrencyVersion`; PATCH/DELETE require `If-Match`, compare inside serializable transactions, and use conditional writes to reject stale clients without lost updates.
- [x] Add cursor pagination and query filters.
  - Existing bounded date/id cursors now combine with up to five typed, declared-field JSON equality filters inside the installation scope; malformed, unknown, and type-mismatched filters fail closed.
- [x] Add record and storage quotas.
  - Atomic installation counters enforce configurable byte and record-count quotas (`EXTENSION_DATA_QUOTA_BYTES`, `EXTENSION_RECORD_QUOTA`), individual records are capped at 1MB, and create/delete/update adjust counters transactionally.
- [x] Add audit events for data mutation and privileged reads.
  - CREATE, UPDATE, DELETE, capability denial, and bounded dataset EXPORT emit tenant audit events carrying extension, installation, version, resource, actor, size, and concurrency metadata.
- [x] Add retention, export, uninstall, and purge behavior.
  - Capability-checked exports are bounded to 10,000 installation-owned records; uninstall retains records through the configurable grace period, and scheduled/manual purge cascades installation data with signed purge evidence. Production preflight found zero orphan records; all 311 backend tests, both production builds, and six browser tests passed on 2026-08-13.

### Updates and migrations

- [x] Implement `MANUAL`, `NOTIFY_ADMINS`, and `AUTOMATIC` policies.
- [x] Implement internal, pilot, 5%, 25%, and 100% rollout waves.
- [x] Add automatic pause thresholds.
- [x] Add extension data migration backup.
- [x] Add migration timeout, retry, rollback, and operator intervention.
- [x] Add compatibility checks for dependencies and platform API versions.
  - Automatic upgrades now enter idempotent lifecycle jobs; deterministic cohorts, failure-triggered rollout pauses, explicit operator resume, durable versioned backups, bounded migration transactions, retry/intervention states, exact rollback metadata, dependency checks, and platform-range enforcement fail closed. Production preflight found zero policy or backup orphans; Prisma validation, 315 backend tests, both production builds, and six browser tests passed. Railway deployments `5d1393f1-6183-48bc-b01d-026d2608a96e` (API), `b3368f59-3e7f-404a-9828-bc163cf5fbc3` (frontend), and `5ef0a846-254d-40cd-a25e-8f62f3d4b45b` (extension worker) succeeded with 45 migrations on 2026-08-13.

### Resource governance

- [x] Define request, concurrency, storage, record, export, and job quotas.
- [x] Add school-level and extension-level quota enforcement.
- [x] Add noisy-neighbor detection.
  - Distributed Redis request/concurrency/export counters and serializable PostgreSQL storage/record/job reservations now enforce both school and extension boundaries. Counter integrity covers CRUD, migration, rollback, uninstall purge, scheduled purge, and extension purge; nonnegative database constraints and authoritative backfill protect rollout. Violations raise deduplicated `RESOURCE_QUOTA` alerts for noisy-neighbor investigation. Production preflight found zero negative or mismatched counters; Prisma validation, 322 backend tests, both production builds, and six browser tests passed. Railway deployments `869280d5-819b-42aa-adf4-ad7e7bd61f73` (API) and `3ea3782c-8e49-4c58-b047-826441f9d74d` (extension worker) succeeded with 46 migrations on 2026-08-13; frontend was correctly skipped because this slice changed no frontend files.
- [x] Add extension circuit breaker.
- [x] Add kill switches by publisher, extension, version, school, and capability.
  - A Redis-distributed, per-extension circuit counts only server failures, supports recovery probes, and raises critical runtime alerts without treating client errors as extension failures. Audited fail-closed controls cover publisher, extension, version, school, and capability scopes across runtime access and install, upgrade, and activation paths while preserving deactivation, uninstall, and purge recovery operations. Prisma validation, 326 backend tests, both production builds, and six browser tests passed. Railway deployments `09a36a81-66e0-4bd9-ba78-1a0e0fdb9615` (API), `6972741a-089c-47f3-8fe6-d4c0a6cee9f6` (frontend), and `5b9c437a-e2b5-4e2e-ad4f-48d1b0a8f774` (extension worker) succeeded with 47 migrations on 2026-08-13.

### Pilot extensions

- [x] Build one complete declarative business extension.
- [x] Build one complete theme extension.
- [x] Test install, activation, update, rollback, disable, uninstall, reinstall, and purge.
- [x] Test multiple installed extensions with navigation and permission conflicts.
  - `STUDENT_REWARDS` exercises role-filtered navigation, accessible declarative components, tenant records, translations, and least-privilege capabilities; `AURORA_KHMER` exercises bounded tokens and scoped CSS across public and dashboard surfaces. Both release ZIPs pass the production validator. Focused lifecycle tests prove clean reinstall requests, grace-period uninstall, quota-reconciled purge, independent namespaced navigation, and manifest-owned capability denial in addition to the existing install, activation, upgrade, rollback, and disable coverage. Operating and rollback steps are documented in `docs/pilot-extensions.md`.

### Stage 4 gate

- [x] A failing extension does not break core login or school administration.
- [x] Runtime cannot execute arbitrary JavaScript, SQL, shell, network, or filesystem operations.
- [x] Pilot extensions pass full lifecycle tests.
- [x] Resource limits and emergency controls are proven.
  - Stage 4 closes with a declarative-only runtime, immutable signed artifacts, independent per-extension circuits, fail-closed emergency controls, school and extension quotas, and complete module/theme pilot lifecycle coverage. Package validation rejects executable and undeclared content; runtime isolation and architecture tests protect core routes. The final pilot regression passed 329 backend tests, both production builds, and both real ZIP validators on 2026-08-13.

## Stage 5 — Observability, Backup, and Recovery

### Telemetry

- [x] Add structured JSON logs.
- [x] Add request and job correlation IDs.
- [x] Add distributed tracing.
  - OpenTelemetry initializes before application dependencies, exports OTLP protobuf spans when configured, auto-instruments HTTP, PostgreSQL, Redis, and supported libraries, and creates explicit BullMQ consumer spans. W3C `traceparent` crosses the durable job envelope while request IDs and active trace IDs remain searchable in JSON logs. Safe sampling, TLS collector configuration, disabled-mode startup, and emergency rollback are documented in `docs/distributed-tracing.md`. All 333 backend tests and the production build passed; Railway deployments `13111f1a-09f6-40e0-a149-d1ef29eedf2a` (API) and `f673e646-eb19-49ad-a761-fa7165d1b11b` (extension worker) succeeded on 2026-08-13.
- [x] Include school, user, extension, version, installation, release, and outcome dimensions where safe.
  - API and worker bootstraps now use a secret-redacting one-line JSON logger. Bounded request and trace headers are returned to clients, safe request dimensions are restored through async context, queue producers inherit the current trace ID, and workers restore trace, job, school, and actor context before handling work. The contract and rollback guidance are documented in `docs/telemetry-correlation.md`. The full 331-test backend suite and production build passed; Railway deployments `5918dd49-b01c-45b4-aee1-c86020c3cf8c` (API) and `c9f9b644-b955-492e-8a30-967eab092541` (extension worker) succeeded on 2026-08-13 after a health-route failure injection exposed and verified the tenantless correlation fallback.
- [x] Add API latency, errors, saturation, and availability dashboards.
- [x] Add database, Redis, queue, worker, and R2 dashboards.
- [x] Add per-school and per-extension usage dashboards.
  - `/platform/observability` combines distributed minute-bucket API RED metrics, process saturation, PostgreSQL connection capacity, Redis and R2 probes, BullMQ depth/age/failures, worker registration, and top school/extension resource consumers. It complements the durable school usage trends and extension-specific telemetry already available to operators. Metrics fail soft with bounded local fallback and expire after two hours; architecture and rollback guidance are documented in `docs/observability-dashboard.md`. All 336 backend tests, both production builds, and six browser tests passed; Railway deployments `7c53f753-60c4-4a06-9eba-7e77b93c5ace` (API), `1f26dd8e-0f5e-441f-8ee6-bcc10ae4da2c` (frontend), and `3468d712-790b-4e11-b425-5a69a83e6687` (extension worker) succeeded on 2026-08-13.
- [x] Define paging and ticket alerts.
  - A five-minute distributed scan persists and deduplicates API SLO, PostgreSQL, Redis, R2, queue, and worker alerts, automatically resolves recovered fingerprints, and routes warning conditions to tickets and critical conditions to paging HTTPS webhooks. Repeated incidents are suppressed and retried every 30 minutes; missing integrations emit structured error events. Thresholds, safe payloads, acknowledgement, recovery, and fallback routing are documented in `docs/alert-routing.md`. All 339 backend tests and both production builds passed; Railway deployments `977de672-119e-42dc-82f0-adc00cba161b` (API), `20850653-2e8b-4c5a-af87-38e2a94c7c09` (frontend), and `6db41d36-6d85-425e-93f1-2a495d3871f6` (extension worker) succeeded on 2026-08-13.

### Backup and restore

- [ ] Enable and verify PostgreSQL point-in-time recovery.
- [ ] Add encrypted daily backup policy.
  - [x] Make school exports asynchronous and checksummed.
    - Tenant-scoped, idempotent export requests now run on the durable operations queue, write immutable SHA-256-addressed private R2 objects, and persist size, row count, status, attempts, and bounded failures. PostgreSQL RLS and role grants cover the export metadata table. All 342 backend tests and both production builds passed; Railway deployments `79cf3c32-39bb-45dd-bba2-1bd61645de70` (API), `31813100-ea36-4165-a4c0-3668dfc9c3a7` (frontend), and `da579bb7-38c5-4cf0-9ce3-6ba3f92e12f3` (extension worker) succeeded on 2026-08-13.
  - [x] Add short-lived signed export downloads.
    - Available exports return five-minute private SigV4 download URLs with a separately auditable SHA-256 checksum and size. Request, completion, and download events are audited; the school admin UI polls durable status rather than streaming exports through the API. See `docs/school-backup-exports.md`.
- [x] Restore into isolated verification environment first.
  - Restore requests now pass through a read-only operations-worker stage before approval. It recomputes immutable SHA-256, bounds bytes and rows, validates the version/model allowlist and row shapes, and rejects foreign tenant IDs without writing live application data. The arbitrary upload/direct-import path was removed. See `docs/restore-approval-workflow.md`.
- [ ] Add school-scoped logical restore that cannot affect another tenant.
- [x] Add restore approval and audit workflow.
  - Durable restore states, tenant RLS, school request UI, platform recovery review UI, structured verification evidence, independent platform-admin approval, compare-and-set transitions, mandatory reasons, separation of duties, and target-school audit events are implemented. Execution remains deliberately locked until the next tenant-safe executor slice. All 345 backend tests and both production builds passed on 2026-08-13.
- [ ] Add quarterly restore rehearsal.

### Data governance

- [ ] Classify core and extension data by sensitivity.
- [ ] Define retention for logs, audits, payments, packages, backups, and extension records.
- [ ] Add automated retention and legal-hold exceptions.
- [ ] Redact secrets and sensitive payloads from telemetry.
- [ ] Add school deletion workflow and signed deletion report.
- [ ] Verify R2 and database data are both purged.

### Incident readiness

- [ ] Update extension incident runbook.
- [ ] Add database incident runbook.
- [ ] Add Redis and queue incident runbook.
- [ ] Add R2 incident runbook.
- [ ] Add signing-key compromise runbook.
- [ ] Add tenant-isolation incident runbook.
- [ ] Run game-day exercises.

### Stage 5 gate

- [ ] Demonstrate RPO at or below 15 minutes.
- [ ] Demonstrate RTO at or below 60 minutes.
- [ ] Alerts identify affected school and extension safely.
- [ ] On-call team completes recovery using documented runbooks.

## Stage 6 — 1,000-School Certification

### Load-test preparation

- [ ] Build deterministic synthetic-school generator.
- [ ] Generate realistic user, extension, record, audit, and asset distributions.
- [ ] Define normal, peak, burst, and failure test profiles.
- [ ] Protect production from accidental load-test execution.
- [ ] Add cost measurement to load tests.

### Performance tests

- [ ] Provision 1,000 schools.
- [ ] Test 500,000 registered users.
- [ ] Test 10,000 concurrent sessions.
- [ ] Test 1,000 requests/second sustained.
- [ ] Test 3,000 requests/second burst.
- [ ] Run marketplace publication and staged updates during traffic.
- [ ] Run backups, validation, and migrations during traffic.
- [ ] Verify database pool, Redis, queue, worker, and R2 limits.

### Failure tests

- [ ] Simulate database failover.
- [ ] Simulate Redis interruption.
- [ ] Simulate queue backlog and worker loss.
- [ ] Simulate R2 latency and failure.
- [ ] Simulate bad extension release.
- [ ] Simulate signing-key revocation.
- [ ] Simulate one abusive school and one abusive extension.
- [ ] Verify core service remains within approved degradation limits.

### Stage 6 gate

- [ ] Two-hour sustained test meets SLOs.
- [ ] Burst profile recovers without manual repair.
- [ ] No tenant-isolation failure.
- [ ] Autoscaling behavior matches policy.
- [ ] Capacity and cost report is approved.
- [ ] Next scaling thresholds are documented.

## Stage 7 — Controlled Rollout

- [ ] Roll out to internal schools.
- [ ] Roll out to 10 pilot schools.
- [ ] Hold seven stable days and review SLO, support, security, and cost.
- [ ] Roll out to 50 schools.
- [ ] Hold and review.
- [ ] Roll out to 250 schools.
- [ ] Hold and review.
- [ ] Roll out to 500 schools.
- [ ] Hold and review.
- [ ] Roll out to 1,000 schools.
- [ ] Publish final operating limits and support procedures.

## Coding Start Gate

Coding for Stage 1 must not start until:

- [ ] Stage 0 architecture decisions are approved.
- [ ] A production database backup is verified.
- [ ] A staging environment is available.
- [ ] The obsolete-model inventory is reviewed.
- [ ] Redis and queue choices are recorded.
- [ ] Tenant domain and RLS approaches are recorded.
- [ ] Rollback ownership is assigned.
