# Wattaman Platform Architecture Roadmap — 1,000 Schools

## 1. Objective

Reform Wattaman into an extension-first, multi-tenant education platform that can operate at least 1,000 schools without deploying a separate application stack per school.

The platform must provide:

- A small, stable school core: authentication, users, settings, audit, backup, appearance, posts, search, and extension management.
- A governed extension marketplace for modules, themes, and integrations.
- Strong tenant isolation across HTTP requests, database access, storage, jobs, logs, metrics, and extension execution.
- Horizontal scaling of stateless API and frontend services.
- Safe upgrades, rollback, incident response, and school-level suspension.
- Predictable performance and cost as schools and extensions grow.

## 2. Planning Assumptions

Initial capacity target:

| Measure | Target |
| --- | ---: |
| Schools | 1,000 |
| Active users per school | 500 average, 5,000 large-school ceiling |
| Registered users | 500,000 typical |
| Concurrent users | 10,000 normal, 25,000 peak |
| API traffic | 1,000 requests/second sustained, 3,000 requests/second burst |
| Installed extensions | 10 average per school |
| Extension records | 100 million before mandatory partition review |
| Availability | 99.9% monthly for core control plane |
| Recovery point objective | 15 minutes |
| Recovery time objective | 60 minutes |

These are engineering sizing assumptions, not sales limits. Stage 1 must add telemetry so they can be replaced by measured values.

## 3. Current Architecture Assessment

### Strengths to preserve

- Tenant identity is represented by `School` and carried in JWT claims.
- Host-based school resolution is checked against the authenticated tenant.
- `AsyncLocalStorage` establishes request-scoped tenant context.
- Platform operations are separated from school operations.
- Extensions have publishers, versions, validation, review, signing, visibility, installation, update, migration, payment, metrics, alerts, and records.
- Extension packages are stored outside the application filesystem in R2.
- Frontend extension pages and navigation are resolved dynamically.
- API and frontend services are already independently deployable.

### Gaps before 1,000 schools

- Legacy feature tables, relations, and runtime directories were removed; an executable architecture inventory prevents accidental restoration.
- Tenant enforcement depends heavily on application conventions rather than database row-level security.
- Host resolution contains a single-school fallback that must not exist in a multi-school production environment.
- Database migrations and production seed synchronization run during every API container start.
- Scheduled tasks and validation workers run inside the API process, creating duplicate-work risk when horizontally scaled.
- Rate limiting is per process and IP, not globally coordinated by tenant and user.
- Extension records use a generic shared table without a published partitioning and retention policy.
- Backup and restore need school-scoped, encrypted, asynchronous workflows with restore verification.
- Extension execution quotas, circuit breakers, and noisy-neighbor controls need enforcement.
- Observability needs school, extension, version, request, and job correlation across services.
- There is no formal load-test gate, disaster-recovery rehearsal, or capacity review process.

## 4. Target System Boundaries

### 4.1 Control plane

Platform-owned operations:

- School provisioning, lifecycle, domain verification, suspension, and deletion.
- Publisher onboarding, permissions, signing keys, and suspension.
- Extension upload, quarantine, validation, review, publication, delisting, and emergency block.
- Marketplace catalog, pricing, payment evidence, and approval.
- Fleet-wide installation visibility, update waves, alerts, and usage reporting.
- Platform configuration and operational policy.

The control plane must never depend on one school's runtime data to remain available.

### 4.2 School plane

Tenant-scoped operations:

- Authentication and school users.
- School settings, appearance, posts, audit, backup requests, and search.
- Marketplace browsing and extension requests.
- Extension installation, activation, update policy, deactivation, uninstall, and data purge.
- Declarative extension pages, records, and permitted actions.

Every school-plane query must carry an authoritative `schoolId` derived from a verified domain and JWT relationship.

### 4.3 Data plane

- PostgreSQL is authoritative for platform metadata, tenant identity, installations, audit indexes, and extension records.
- R2 stores immutable extension packages, quarantined uploads, signed releases, theme assets, payment evidence, exports, and backups.
- Redis stores distributed rate-limit counters, short-lived caches, idempotency keys, locks, sessions if needed, and job coordination.
- A durable queue runs validation, signing, installation, migration, backup, restore, cleanup, notification, and metrics-rollup jobs.

## 5. Tenant Isolation Model

### Required request flow

1. Edge proxy normalizes the host and assigns a request ID.
2. Domain resolver maps the exact verified hostname to a school.
3. Authentication verifies the access token and session state.
4. Authorization verifies token `schoolId` equals resolved `schoolId`.
5. Tenant context is opened for the request.
6. Repository/query layer requires tenant scope by default.
7. PostgreSQL row-level security verifies the database session tenant.
8. Audit and metrics include school, user, extension, request, and trace IDs.

### Mandatory safeguards

- Remove the one-school hostname fallback before onboarding a second production school.
- Add a `SchoolDomain` model supporting verified custom domains and managed subdomains.
- Reject unknown hosts; never guess a tenant.
- Set a transaction-local PostgreSQL tenant variable on every school transaction.
- Add row-level security policies to every tenant-owned table.
- Restrict unscoped database credentials to control-plane jobs and tightly audited platform operations.
- Add automated cross-tenant tests for every repository and endpoint.
- Never include raw tenant data in shared caches without `schoolId` in the cache key.
- Prefix R2 keys with environment and immutable school or publisher identifiers.

## 6. Database Architecture

### Stage-one topology

Use one managed PostgreSQL cluster with:

- Connection pooling through PgBouncer or the provider pooler.
- Separate application roles for school runtime, control plane, migrations, and read-only analytics.
- Point-in-time recovery and daily encrypted snapshots.
- Read replica for reporting when measured load justifies it.
- Slow-query logging and query fingerprints.

One well-governed cluster is operationally safer for 1,000 schools than 1,000 databases. Database-per-tenant remains an enterprise isolation option, not the default.

### Schema reform

- Remove all legacy feature models after dependency verification and export retention decisions.
- Keep core tables in the application schema.
- Keep extension metadata normalized.
- Use `ExtensionRecord` only as a governed declarative-data abstraction.
- Add explicit schema version, optimistic concurrency version, archival state, and retention metadata to extension records.
- Partition high-volume tables by time, with school-aware indexes:
  - `AuditLog`
  - `ExtensionApiMetric`
  - `ExtensionRecord` when thresholds are reached
  - operational job/event history
- Standardize indexes beginning with `schoolId` for tenant-scoped access paths.
- Use cursor pagination; prohibit unbounded list endpoints.
- Add query budgets and explain-plan review for high-volume endpoints.

### Migration rules

- Never run migrations from every API replica.
- Add a single release migration job with an advisory lock.
- Require expand-and-contract migrations for zero-downtime releases.
- Separate schema migration from extension data migration.
- Record checksums, start/end time, actor/release, and rollback availability.
- Block deployment when schema compatibility checks fail.

## 7. Extension Marketplace Architecture

### Package lifecycle

`DRAFT -> UPLOADED -> QUARANTINED -> VALIDATED -> SUBMITTED -> APPROVED -> SIGNED -> PUBLISHED`

Terminal or exceptional states:

- `REJECTED`
- `DEPRECATED`
- `BLOCKED`
- `RETIRED`
- `PURGED`

Every transition must be idempotent, authorized, audited, and driven by a durable job where external storage or long-running work is involved.

### Package security

- Immutable object keys based on publisher, extension, version, and SHA-256.
- File count, expanded-size, compression-ratio, path traversal, symlink, MIME, and manifest limits.
- Antivirus and content-policy scanning.
- Declarative schema validation with denied-by-default capabilities.
- Ed25519 signature verification before installation and at runtime cache fill.
- Software bill of materials for any future executable package.
- Short-lived signed object URLs; no public quarantine bucket.
- Publisher key rotation, retirement, revocation, and incident blast-radius reporting.

### Marketplace product model

- Categories, tags, supported locales, screenshots, documentation, support URL, privacy policy, and data-use declaration.
- Compatibility ranges tied to platform API versions.
- Free, one-time, subscription, and private-contract commercial types.
- School request with auto-filled tenant/admin information and payment evidence.
- Platform approval separated from technical installation and activation.
- Ratings and reviews only after verified installation, in a later stage.

### Installation lifecycle

`REQUESTED -> PAYMENT_REVIEW -> APPROVED -> INSTALLING -> INSTALLED -> ACTIVE`

Additional states:

- `UPDATE_AVAILABLE`
- `UPDATING`
- `DISABLED`
- `FAILED`
- `UNINSTALLING`
- `UNINSTALLED`
- `PURGE_SCHEDULED`
- `PURGED`

Installation commands require idempotency keys and per-school/per-extension distributed locks.

### Update policies

- `MANUAL`: school admin explicitly accepts updates.
- `NOTIFY_ADMINS`: platform announces and school decides.
- `AUTOMATIC`: eligible releases deploy through controlled waves.

Automatic rollout waves:

1. Internal test schools.
2. Pilot schools.
3. 5% of eligible installations.
4. 25%.
5. 100%.

Pause automatically when error rate, latency, validation, migration, or support thresholds fail.

## 8. Extension Runtime Model

### Declarative extensions

The first production runtime remains declarative:

- Manifest-defined navigation and pages.
- Approved component library only.
- Typed fields and server-enforced validation.
- Capability-based API access.
- School-scoped extension records.
- No arbitrary JavaScript, SQL, shell, network access, or filesystem access.

### Executable extensions

Executable packages must not run inside the main API process. A later stage may introduce:

- Isolated workers or containers per execution class.
- Signed SDK contract and versioned gateway.
- Egress allowlists.
- CPU, memory, duration, concurrency, and payload quotas.
- Per-extension secrets stored in a secrets manager.
- Kill switch by publisher, extension, version, school, and capability.

Executable runtime launch requires a separate threat model and security review.

### Resource governance

Enforce quotas by school and extension:

- Requests per minute.
- Concurrent jobs.
- Record count and storage bytes.
- API payload and response sizes.
- Export frequency.
- Backup frequency.
- Validation and migration duration.

The system must degrade or disable one extension without taking down school authentication or the control plane.

## 9. Service Architecture

### Stateless web services

- `frontend`: Next.js school and platform interfaces.
- `api`: NestJS synchronous control-plane and school-plane APIs.

Both scale horizontally and contain no unique scheduled work.

### Worker services

- `extension-worker`: package validation, signing, publication, installation, update, and migration jobs.
- `operations-worker`: backups, restores, retention, deletion, and metrics rollups.
- `notification-worker`: email, SMS, and admin notifications.

Workers consume durable queues with retry policy, dead-letter queues, idempotency, heartbeats, and job ownership leases.

### Edge and caching

- CDN-cache immutable marketplace media and signed theme assets.
- Cache public catalog queries with short TTL and explicit invalidation.
- Do not cache authenticated tenant responses at shared edge unless the complete tenant/user authorization key is included.
- Use Redis for distributed rate limits and short-lived control-plane cache.

## 10. Provisioning and School Lifecycle

### Create school

1. Platform admin submits school and first-admin details.
2. Validate unique subdomain/domain and normalize identity fields.
3. Create school in `PROVISIONING` state.
4. Create administrator and default site settings transactionally.
5. Create storage prefixes and quota records asynchronously.
6. Verify domain and TLS readiness.
7. Run provisioning health checks.
8. Mark school `ACTIVE` and send onboarding instructions.

No legacy module rows are created. The school begins with only the base shell.

### Suspend school

- Immediately reject new sessions and tenant API traffic.
- Keep data and backups according to policy.
- Preserve platform-admin recovery access.
- Record reason, actor, timestamp, and review date.

### Delete school

- Require step-up authentication and dual confirmation.
- Create final export when policy requires it.
- Mark `DELETION_SCHEDULED` and revoke sessions.
- Disable extensions and cancel jobs.
- Purge tenant database and object-storage data asynchronously.
- Produce a signed deletion report.
- Keep only legally required billing and security audit metadata.

## 11. Authentication and Authorization

- Short-lived access tokens with rotating refresh tokens.
- MFA mandatory for platform administrators and publisher release roles.
- Session inventory and remote revocation.
- Role and capability checks enforced server-side.
- Step-up authentication for publication, key changes, school deletion, restore, and emergency block.
- Secrets managed outside Railway variables when scale and team access require a dedicated secrets manager.
- Password-reset delivery runs as a reliable queued job with generic user-facing responses.
- Add SSO/SAML/OIDC only through a versioned integration boundary.

## 12. Reliability and Operations

### Service-level objectives

| Capability | Availability | p95 latency |
| --- | ---: | ---: |
| Login and session refresh | 99.95% | 500 ms |
| Core school reads | 99.9% | 500 ms |
| Core school writes | 99.9% | 800 ms |
| Marketplace browse | 99.9% | 800 ms |
| Extension runtime reads | 99.9% | 800 ms |
| Background installation | 99.5% completed within 10 minutes | n/a |

### Observability

Every request and job emits:

- Environment and release.
- Request or job ID.
- Trace and span ID.
- School ID where applicable.
- User ID where allowed.
- Extension, version, and installation IDs where applicable.
- Outcome, latency, retry count, and error class.

Required dashboards:

- API availability, saturation, latency, and errors.
- Database connections, query latency, locks, storage, and replication lag.
- Queue depth, oldest job age, retries, and dead letters.
- Extension validation and installation success rates.
- Per-school and per-extension resource usage.
- R2 errors, storage growth, and signed URL failures.
- Authentication failures and suspicious cross-tenant attempts.

### Resilience

- Health endpoints separate liveness from readiness.
- Graceful shutdown stops new traffic and finishes bounded in-flight work.
- Circuit breakers protect R2, email, SMS, and other integrations.
- Retries use exponential backoff and jitter only for retry-safe operations.
- Database and queue operations use idempotency keys.
- Quarterly restore tests and twice-yearly regional disaster-recovery exercises.

## 13. Backup and Data Governance

- Continuous database point-in-time recovery.
- Daily platform backup with retention tiers.
- School exports are asynchronous, encrypted, checksummed, and short-lived.
- Restore always targets an isolated verification environment first.
- School-level logical restore must not overwrite other tenants.
- Classify data by sensitivity and retention requirement.
- Record consent and legal basis where local regulation requires it.
- Redact secrets and sensitive payloads from logs.
- Publish extension data-use declarations and enforce declared capabilities.

## 14. Delivery Stages

### Stage 0 — Architecture baseline

Deliverables:

- Approve capacity assumptions, SLOs, RPO, and RTO.
- Inventory all retained database models and remove obsolete feature schema.
- Produce architecture diagrams, data classification, and ownership map.
- Add ADRs for tenancy, queue, Redis, RLS, extension runtime, and deployment topology.
- Establish development, staging, and production environments with separate credentials and buckets.

Exit gate:

- No unexplained legacy model, route, job, script, or storage prefix remains.
- Architecture and security owners approve the target design.

### Stage 1 — Tenant safety and provisioning

Deliverables:

- Add verified `SchoolDomain` records.
- Remove hostname fallback.
- Add database roles and row-level security.
- Add tenant isolation tests and static repository rules.
- Make school provisioning asynchronous and observable.
- Add school lifecycle states and idempotent provisioning.

Exit gate:

- Automated tests cannot read or mutate another school's data.
- 1,000 synthetic schools can be provisioned without manual intervention.

### Stage 2 — Production deployment foundation

Deliverables:

- Move migrations and seeds out of API startup.
- Add release migration job and advisory lock.
- Introduce Redis and durable queues.
- Move scheduled and long-running work into worker services.
- Add readiness, graceful shutdown, distributed rate limits, and autoscaling rules.

Exit gate:

- At least three API replicas can run without duplicate jobs or migration races.
- Rolling deployment completes with no failed requests caused by schema incompatibility.

### Stage 3 — Marketplace production hardening

Deliverables:

- Complete catalog metadata, request, payment evidence, and approval UX.
- Make upload, validation, signing, publication, installation, and deletion job-driven.
- Add antivirus scanning, immutable object policy, retention, and signed URL controls.
- Add publisher onboarding, key rotation, and permission review.
- Add installation idempotency and distributed locks.

Exit gate:

- Lifecycle retry tests prove no duplicate release, installation, charge evidence, or migration.
- Security review approves ZIP handling and signing.

### Stage 4 — Extension runtime and data scale

Deliverables:

- Publish declarative manifest and component API v1.
- Enforce capabilities, quotas, pagination, and payload limits.
- Add extension record schema versions and migration backups.
- Add extension-level circuit breakers and emergency controls.
- Partition high-volume operational tables when load measurements require it.

Exit gate:

- One failing or abusive extension cannot breach another tenant or degrade core login beyond SLO.
- Pilot extensions pass upgrade, rollback, uninstall, and purge tests.

### Stage 5 — Observability, backup, and disaster recovery

Deliverables:

- Add distributed tracing and structured logs.
- Add SLO dashboards and paging alerts.
- Complete school export, verified restore, deletion reports, and retention automation.
- Run production-sized recovery rehearsal.
- Create incident runbooks for database, queue, R2, signing key, extension, and tenant incidents.

Exit gate:

- Demonstrated RPO of 15 minutes and RTO of 60 minutes.
- On-call responders complete a game-day exercise using only documented runbooks.

### Stage 6 — 1,000-school load certification

Test profiles:

- 1,000 schools with realistic user and extension distributions.
- 10,000 concurrent authenticated sessions.
- Morning login and attendance-style burst even though attendance itself is an extension.
- Marketplace publication and staged update during normal traffic.
- Backup, validation, and migration jobs under peak load.
- Database failover, Redis interruption, queue backlog, R2 latency, and bad extension scenarios.

Exit gate:

- SLOs pass for two-hour sustained load and burst tests.
- No tenant-isolation failure.
- Autoscaling and recovery behavior match the runbooks.
- Capacity report documents safe limits and the next scaling threshold.

### Stage 7 — Controlled production rollout

Rollout:

1. Internal schools.
2. 10 pilot schools.
3. 50 schools.
4. 250 schools.
5. 500 schools.
6. 1,000 schools.

Each wave requires seven stable days, SLO review, support review, cost review, and rollback readiness.

## 15. Workstreams and Ownership

| Workstream | Primary responsibility |
| --- | --- |
| Platform core | Tenancy, provisioning, school lifecycle, API boundaries |
| Marketplace | Publisher, catalog, review, commercial workflow |
| Extension runtime | Manifest, capabilities, records, migrations, quotas |
| Infrastructure | PostgreSQL, Redis, queue, R2, deployment, autoscaling |
| Security | RLS, signing, scanning, secrets, threat models, incident response |
| Reliability | SLOs, telemetry, alerts, backup, restore, disaster recovery |
| Product UX | Platform-admin and school-admin marketplace workflows |
| Quality | Isolation, lifecycle, load, chaos, migration, and recovery tests |

Small teams may combine roles, but every deliverable must have one accountable owner.

## 16. Immediate Implementation Backlog

Priority 0:

- Remove obsolete Prisma feature models and create a reviewed destructive migration.
- Remove the single-school hostname fallback.
- Stop running migration and seed commands in every API startup.
- Add staging environment and production-copy rehearsal process.
- Add tenant-isolation integration tests around all retained core services.

Priority 1:

- Add `SchoolDomain`, quota, and provisioning-job models.
- Choose and provision Redis plus a durable queue.
- Split worker processes from the API.
- Add distributed rate limiting and idempotency storage.
- Add structured logs and request/job correlation IDs.

Priority 2:

- Add PostgreSQL row-level security and dedicated database roles.
- Convert extension lifecycle work to jobs with dead-letter handling.
- Add signed upload/download URLs and malware scanning.
- Add school and extension usage quotas.
- Add load-test data generators for 1,000 synthetic schools.

## 17. Definition of Ready for Coding

Implementation begins only after these decisions are recorded:

- Managed PostgreSQL capacity and pooling option.
- Redis and queue technology.
- Exact school-domain strategy.
- RLS rollout approach and migration credential ownership.
- Backup retention and deletion policy.
- Marketplace commercial model and payment responsibility.
- Declarative extension API v1 boundary.
- SLO, RPO, and RTO approval.
- Team ownership for infrastructure and incident response.

## 18. Definition of Done

The reform is complete when:

- A new school is provisioned automatically with only the base shell.
- All additional school functionality is installed through governed extensions.
- Tenant isolation is enforced in both application and database layers.
- API and workers scale horizontally without duplicate work.
- Extension publication, installation, update, rollback, uninstall, and purge are reliable and auditable.
- Platform operators can identify and stop a bad extension without stopping the platform.
- Backup and restore objectives are proven by rehearsal.
- The certified load profile supports 1,000 schools within approved SLOs and cost targets.
