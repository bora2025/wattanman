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

- [ ] Inventory every remaining Prisma model and classify it as core, extension-platform, migration-only, or obsolete.
- [ ] Identify retained services that still access removed feature models.
- [ ] Export any legacy data that must be retained.
- [ ] Remove obsolete feature models from `prisma/schema.prisma`.
- [ ] Create and rehearse the destructive cleanup migration against a production-sized backup.
- [ ] Remove obsolete dependencies, environment variables, scripts, and documentation.
- [ ] Update the root architecture documentation and directory map.

### Architecture decisions

- [ ] Record an ADR for tenant domain resolution.
- [ ] Record an ADR for PostgreSQL row-level security.
- [ ] Record an ADR for Redis and durable queue technology.
- [ ] Record an ADR for API, worker, and migration service separation.
- [ ] Record an ADR for declarative extension API v1.
- [ ] Record an ADR for backup retention and deletion policy.
- [ ] Approve SLO, RPO, RTO, and capacity assumptions.
- [ ] Assign accountable owners for platform, marketplace, runtime, infrastructure, security, and reliability.

### Stage 0 gate

- [ ] Backend production build passes.
- [ ] Frontend production build passes.
- [ ] Extension lifecycle tests pass.
- [ ] No unexplained legacy runtime file or database model remains.
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
- [~] Remove the single-school fallback.
  - Exact verified domains now take precedence; the fallback remains temporarily enabled unless `ALLOW_SINGLE_SCHOOL_HOST_FALLBACK=false` to avoid locking out the current Railway school before domain backfill.
- [~] Reject unknown and unverified hosts.
  - Unknown hosts fail closed when the temporary fallback flag is disabled.
- [x] Normalize forwarded host headers safely.
- [ ] Add trusted-proxy configuration.
- [ ] Add cache with explicit domain-change invalidation.
- [ ] Preserve JWT `schoolId` versus host `schoolId` enforcement.

### Database isolation

- [ ] Create separate migration, control-plane, school-runtime, and analytics database roles.
- [ ] Add a transaction-local tenant identifier.
- [ ] Enable row-level security on every tenant-owned core table.
- [ ] Add deny-by-default RLS policies.
- [ ] Restrict unscoped operations to audited platform paths.
- [ ] Verify background jobs explicitly establish tenant scope.
- [ ] Add school ID to every tenant-owned unique key and index where required.

### Isolation tests

- [ ] Add two-school fixtures with overlapping email, names, and extension keys.
- [ ] Test cross-school reads for every retained controller.
- [ ] Test cross-school writes and deletes.
- [~] Test forged host headers.
  - Unknown-host and fallback-disabled middleware behavior is covered; authenticated JWT/host mismatch coverage remains.
- [ ] Test valid token on wrong school domain.
- [ ] Test platform-scope authorization.
- [ ] Test tenant isolation in extension records, assets, metrics, and jobs.
- [ ] Add tenant isolation tests to required CI checks.

### Provisioning workflow

- [ ] Add school lifecycle states: `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `DELETION_SCHEDULED`, `DELETED`.
- [ ] Add idempotent provisioning job model.
- [ ] Create the school and first administrator transactionally.
- [ ] Create only base settings and storage prefixes.
- [ ] Do not create module or extension installation rows by default.
- [ ] Add provisioning retry and failure recovery.
- [ ] Add provisioning status UI for platform administrators.
- [ ] Add onboarding notification after readiness checks pass.

### Stage 1 gate

- [ ] Provision 1,000 synthetic schools without manual intervention.
- [ ] No tenant-isolation test failure.
- [ ] Unknown hosts fail closed.
- [ ] Provisioning retries create no duplicate schools, users, or domains.

## Stage 2 — Production Deployment Foundation

### Release process

- [ ] Remove migration execution from API startup.
- [ ] Remove production seed execution from API startup.
- [ ] Create a dedicated migration release command or service.
- [ ] Protect migrations with a PostgreSQL advisory lock.
- [ ] Add schema compatibility check before application rollout.
- [ ] Adopt expand-and-contract migration rules.
- [ ] Document rollback and roll-forward procedures.

### Redis and queues

- [ ] Select managed Redis provider and deployment topology.
- [ ] Select queue library and persistence model.
- [ ] Define job envelope, version, tenant context, trace ID, and idempotency key.
- [ ] Add retry policy with exponential backoff and jitter.
- [ ] Add dead-letter queue and replay controls.
- [ ] Add distributed locks for school and extension operations.
- [ ] Add job heartbeat and ownership lease.
- [ ] Add queue-depth and oldest-job alerts.

### Service separation

- [ ] Keep frontend and API stateless.
- [ ] Create extension worker process.
- [ ] Create operations worker process.
- [ ] Create notification worker process.
- [ ] Move scheduled jobs out of the API process.
- [ ] Ensure workers use explicit tenant context.
- [ ] Add graceful shutdown for API and workers.
- [ ] Add separate liveness and readiness endpoints.

### Distributed protection

- [ ] Replace process-local throttling with Redis-backed rate limits.
- [ ] Rate limit by IP, user, school, extension, and sensitive action.
- [ ] Add idempotency storage for mutating APIs.
- [ ] Add request size and response size limits.
- [ ] Add cursor pagination requirements.
- [ ] Add circuit breakers for R2, email, SMS, and external integrations.

### Stage 2 gate

- [ ] Run at least three API replicas safely.
- [ ] Prove only one migration job executes.
- [ ] Prove scheduled jobs do not duplicate.
- [ ] Complete a rolling deployment without incompatible-schema errors.
- [ ] Recover and replay a dead-letter job successfully.

## Stage 3 — Marketplace Production Hardening

### Catalog and publisher UX

- [ ] Finalize extension categories, tags, locales, support links, privacy policy, and data-use fields.
- [ ] Add publisher onboarding and verification.
- [ ] Add publisher member role management.
- [ ] Add key registration, rotation, retirement, and revocation UX.
- [ ] Add catalog search, filters, sort, pagination, and featured collections.
- [ ] Separate school marketplace and installed-extension management pages.

### Package pipeline

- [ ] Make upload completion asynchronous and idempotent.
- [ ] Enforce immutable checksum-addressed R2 keys.
- [ ] Add antivirus scanning.
- [ ] Enforce expanded-size, file-count, path, symlink, MIME, and compression-ratio limits.
- [ ] Validate manifest against versioned JSON Schema.
- [ ] Record validation tool versions and reports.
- [ ] Sign only approved immutable packages.
- [ ] Verify signatures before installation and runtime cache use.
- [ ] Add quarantine and rejected-package retention policies.

### Review and publication

- [ ] Enforce uploader/reviewer separation when required.
- [ ] Add structured technical, permission, privacy, and compatibility review.
- [ ] Require review notes for every decision.
- [ ] Add appeal workflow and audit history.
- [ ] Add publication checklist.
- [ ] Add deprecate, delist, emergency block, retire, and purge controls.

### Commercial workflow

- [ ] Finalize free, one-time, subscription, and private-contract models.
- [ ] Auto-fill school and administrator information in extension requests.
- [ ] Add payment evidence upload through signed URLs.
- [ ] Add platform QR/bank payment settings and rotation history.
- [ ] Add request, payment-review, approval, installation, and activation states.
- [ ] Separate payment approval from installation and activation.
- [ ] Add payment evidence retention and access policy.

### Installation workflow

- [ ] Add installation command idempotency keys.
- [ ] Add distributed school/extension locks.
- [ ] Convert install, update, rollback, uninstall, and purge to jobs.
- [ ] Add progress and failure details to both admin interfaces.
- [ ] Add retry-safe storage and database operations.
- [ ] Add uninstall grace period and scheduled purge.
- [ ] Add signed purge report.

### Stage 3 gate

- [ ] Lifecycle retries create no duplicate release or installation.
- [ ] Malicious ZIP test suite passes.
- [ ] Signing and key-revocation tests pass.
- [ ] Marketplace request appears reliably for platform administrators.
- [ ] Security review approves package handling.

## Stage 4 — Declarative Extension Runtime V1

### Manifest API

- [ ] Freeze extension manifest v1.
- [ ] Freeze theme manifest v1.
- [ ] Publish compatibility and deprecation policy.
- [ ] Define navigation, page, component, field, validation, action, and permission contracts.
- [ ] Define locale and accessibility requirements.
- [ ] Define extension-owned record schema rules.

### Runtime UI

- [ ] Build approved component registry.
- [ ] Deny unknown components and properties.
- [ ] Enforce safe links, images, CSS, and content.
- [ ] Add loading, empty, error, permission-denied, and offline states.
- [ ] Add responsive and keyboard-accessibility tests.
- [ ] Add theme preview and runtime isolation tests.

### Runtime APIs and data

- [ ] Add capability-based extension API gateway.
- [ ] Scope every operation by school, extension, version, and installation.
- [ ] Add record schema version and optimistic concurrency version.
- [ ] Add cursor pagination and query filters.
- [ ] Add record and storage quotas.
- [ ] Add audit events for data mutation and privileged reads.
- [ ] Add retention, export, uninstall, and purge behavior.

### Updates and migrations

- [ ] Implement `MANUAL`, `NOTIFY_ADMINS`, and `AUTOMATIC` policies.
- [ ] Implement internal, pilot, 5%, 25%, and 100% rollout waves.
- [ ] Add automatic pause thresholds.
- [ ] Add extension data migration backup.
- [ ] Add migration timeout, retry, rollback, and operator intervention.
- [ ] Add compatibility checks for dependencies and platform API versions.

### Resource governance

- [ ] Define request, concurrency, storage, record, export, and job quotas.
- [ ] Add school-level and extension-level quota enforcement.
- [ ] Add noisy-neighbor detection.
- [ ] Add extension circuit breaker.
- [ ] Add kill switches by publisher, extension, version, school, and capability.

### Pilot extensions

- [ ] Build one complete declarative business extension.
- [ ] Build one complete theme extension.
- [ ] Test install, activation, update, rollback, disable, uninstall, reinstall, and purge.
- [ ] Test multiple installed extensions with navigation and permission conflicts.

### Stage 4 gate

- [ ] A failing extension does not break core login or school administration.
- [ ] Runtime cannot execute arbitrary JavaScript, SQL, shell, network, or filesystem operations.
- [ ] Pilot extensions pass full lifecycle tests.
- [ ] Resource limits and emergency controls are proven.

## Stage 5 — Observability, Backup, and Recovery

### Telemetry

- [ ] Add structured JSON logs.
- [ ] Add request and job correlation IDs.
- [ ] Add distributed tracing.
- [ ] Include school, user, extension, version, installation, release, and outcome dimensions where safe.
- [ ] Add API latency, errors, saturation, and availability dashboards.
- [ ] Add database, Redis, queue, worker, and R2 dashboards.
- [ ] Add per-school and per-extension usage dashboards.
- [ ] Define paging and ticket alerts.

### Backup and restore

- [ ] Enable and verify PostgreSQL point-in-time recovery.
- [ ] Add encrypted daily backup policy.
- [ ] Make school exports asynchronous and checksummed.
- [ ] Add short-lived signed export downloads.
- [ ] Restore into isolated verification environment first.
- [ ] Add school-scoped logical restore that cannot affect another tenant.
- [ ] Add restore approval and audit workflow.
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
