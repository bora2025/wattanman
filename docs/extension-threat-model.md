# Extension Platform Threat Model

**Scope:** Declarative modules and versioned themes uploaded as ZIP packages.

**Out of scope:** Executable code extensions. Stage 5 remains explicitly deferred and no uploaded package code may execute in the NestJS or Next.js processes.

## Protected assets

- School records and tenant identity boundaries.
- Platform and school administrator credentials.
- PostgreSQL credentials, environment secrets, signing private keys, and R2 credentials.
- Published package integrity, publisher identity, review history, and audit evidence.
- Wattaman availability, core startup, storage capacity, and extension-data quotas.
- Public-site and authenticated-dashboard rendering integrity.

## Trust boundaries

1. A publisher workstation sends an untrusted ZIP across the platform-admin HTTP boundary.
2. The backend writes original bytes to private quarantine storage before validation.
3. Validation converts untrusted archive contents into an approved manifest and approved assets.
4. Review and signing convert a validated draft into an immutable trusted release.
5. Platform installation crosses from the global catalog into one tenant-scoped installation.
6. Declarative runtime requests cross from an authenticated school user into generic extension records.
7. Theme CSS crosses into a sandboxed preview and, after activation, into scoped school rendering.

## Threats and controls

| Threat | Primary controls | Verification |
| --- | --- | --- |
| Path traversal, absolute paths, duplicate paths, symlinks | Normalized archive paths, depth limit, duplicate rejection, explicit symlink rejection | Package-validator malicious-input tests |
| ZIP bomb or capacity exhaustion | 5 MB compressed limit, 10 MB extracted limit, file-count/depth limits, 100:1 ratio limit, tenant data quota | Validator and quota tests |
| Executable code smuggling | Declarative allowlist, executable extension rejection, unknown manifest-property rejection, no dynamic imports or package execution | Validator tests and runtime design |
| MIME spoofing | Content-signature detection for approved images/fonts and text/binary checks | MIME-signature tests |
| CSS escape or script execution | Approved selectors, `.wattaman-theme` rewriting, blocked at-rules/external URLs/unsafe declarations, sandboxed preview, raw CSS mutation retired | CSS tests, visual tests, lifecycle E2E |
| Malicious README content | Script, JavaScript URL, and event-handler rejection | Validator tests |
| Unauthorized upload/review/publication | Platform role guard plus publisher-scoped upload/review/publish/manage roles | Controller/service authorization tests |
| Artifact replacement after review | Checksum-addressed private objects, immutable published storage key, published-row mutation denial, Ed25519 signatures | Signing and lifecycle tests |
| Signing-key compromise | Public-key registry, private key only in environment, retirement/irreversible revocation, affected-version global block | Signing tests and incident runbook |
| Cross-school installation or record access | Host resolution, JWT school matching, Prisma tenant scoping, school-owned records carrying `schoolId` | Two-school HTTP/PostgreSQL E2E |
| Capability escalation | Manifest permission validation, per-request installation/permission checks, permission-difference acknowledgement | Runtime and upgrade tests |
| Dependency confusion or unsafe removal | Exact extension keys, semantic ranges, cycle/conflict checks, dependent-safe uninstall | Dependency tests |
| Data corruption on upgrade | Controlled migration operations, serializable transactions, per-record backups, atomic rollback | Migration tests and lifecycle E2E |
| Persistent failure or compromised release | Health metrics, alerts, audit events, deactivate/uninstall, version block, signing-key revocation | Operational tests and incident runbook |
| Storage or validator failure | Retryable quarantine failure, persisted timeout rejection, structured reports, no implicit publication | Failure-injection tests |
| Billing-driven outage | Manual invoicing only; overdue state never automatically disables runtime access | Installation policy tests |

## Explicitly denied capabilities

Declarative packages receive no Prisma client, raw SQL, filesystem, process environment, arbitrary HTML/React/JavaScript, scheduled jobs, notifications, file APIs, or outbound HTTP. These capabilities require a later approved contract and are not silently available through the generic record API.

## Residual risks and release conditions

- Validation runs in a terminable worker with bounded V8 heaps/stacks, a hard wall-clock deadline, and no filesystem extraction. It is process-isolated rather than a disposable OS/container sandbox; external publishing must not launch until container isolation and malware scanning are added.
- SVG is not accepted. SVG sanitization is required before adding it to the allowlist.
- A production-sized database-copy rehearsal and human security/product/operations approval remain mandatory before production sign-off.
- Pixel baselines protect representative preview documents, not every school-specific content combination.
- Stage 5 executable extensions require a separate threat-model revision covering build isolation, service identity, network policy, runtime credentials, compromise containment, and supply-chain scanning.

## Incident ownership

The Wattaman Platform team owns package incidents. Follow `docs/extension-incident-runbook.md` for blocking, key revocation, affected-school identification, rollback, evidence preservation, communication, and recovery.

Review this threat model whenever a package format, capability, trust policy, storage provider, signing process, or runtime isolation boundary changes.
