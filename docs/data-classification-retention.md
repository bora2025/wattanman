# Data classification and retention

This policy applies to core school data, extension data, operational metadata, PostgreSQL, Redis, and private R2. A legal hold always overrides scheduled deletion until an authorized platform administrator releases it.

## Classification

| Class | Examples | Required controls |
| --- | --- | --- |
| Restricted | Password hashes, MFA secrets, refresh/reset tokens, payment evidence and invoices, bank details, signing/private keys, backup objects | Least privilege, encryption in transit/at rest, never log payloads, private object storage, audited access |
| Confidential | User profiles, unpublished posts, extension records, installation configuration, audit events, school exports, restore reports | Tenant RLS, capability checks, private storage, bounded exports, audited mutation/access |
| Internal | Validation reports, package checksums, queue/job metadata, deployment and aggregate usage metrics | Authenticated operator access, bounded telemetry dimensions, retention cleanup |
| Public | Published school posts, listed extension metadata, explicitly published theme assets | Integrity checks and publication lifecycle; no secret or personal data |

Manifest-declared extension data categories inherit the stricter of `Confidential` and the underlying category. Authentication secrets and raw payment content can never be downgraded by a manifest.

## Retention

| Store | Default retention | Deletion behavior |
| --- | --- | --- |
| Application logs | 30 days | Provider lifecycle; secret-redacted before emission |
| Distributed traces | 14 days | Collector lifecycle; sampled and payload-free |
| Redis API minute metrics | 2 hours | Key TTL |
| PostgreSQL extension API metrics | 30 days | Daily bounded cleanup |
| Audit logs | Minimum 365 days | Tenant cleanup schedule may retain longer, never shorter |
| School daily metrics | 730 days | Daily bounded cleanup |
| Payment evidence/invoices | 2,555 days (7 years) | Private R2 object first, then metadata tombstone; explicit legal hold supported |
| Quarantined extension packages | 7 days abandoned | Immutable object cleanup after durable validation status |
| Rejected extension packages | 30 days after rejection | R2 package/assets deleted; report and checksum retained |
| Published extension packages | Publication lifetime plus 90 days after retirement | Never delete while installable, installed, on hold, or required for rollback |
| Ordinary school export | 7 days | Private R2 object deleted, checksum/audit tombstone retained |
| Pre-restore safety export | 30 days | Same deletion ordering; hold may extend |
| Restore workflow metadata | 365 days after terminal state | Preserve audit events beyond workflow cleanup |
| Extension records | Manifest retention, or uninstall grace policy when shorter is prohibited by law/hold | Tenant-scoped purge with signed report |
| PostgreSQL PITR | Railway archive window (approximately four weeks when enabled) | Provider-managed WAL/base backup expiry |

## Legal holds

A hold records target school, category, optional resource, reason, case reference, creator, and release identity/timestamps. Cleanup must query active holds before destructive database or R2 operations. Holds do not grant data access; ordinary authorization still applies. Releasing a hold never deletes synchronously—it only permits the next audited retention run.

## Ownership

- Platform reliability owns logs, traces, metrics, exports, restores, and provider backups.
- Marketplace operations owns package lifecycle and signing evidence.
- Finance/compliance owns payment retention and legal holds.
- School administrators may extend audit retention but cannot reduce the platform minimum.
- Security approves exceptions and investigates cleanup or isolation failures.
