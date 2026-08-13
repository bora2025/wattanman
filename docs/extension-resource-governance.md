# Extension Resource Governance

## Scope

Declarative extension runtime traffic is governed independently from core school administration. Limits apply at both the tenant-school boundary and the extension boundary so one school or one extension cannot consume the shared platform.

## Default limits

| Resource | School scope | Extension scope |
| --- | ---: | ---: |
| Requests | 3,000/minute | 30,000/minute globally |
| Concurrent requests | 50 | 500 globally |
| Stored data | 1 GiB across extensions | 100 MiB per installation |
| Stored records | 1,000,000 across extensions | 100,000 per installation |
| Exports | 100/hour | 1,000/hour globally |
| Export rows | 10,000 per export | 10,000 per export |
| Active lifecycle jobs | 25 | 500 globally |
| Record payload | 1 MiB | 1 MiB |

Every default is configurable through the corresponding `EXTENSION_*` variable in `backend/.env.example`. Production Redis is mandatory for distributed request, concurrency, and export counters. Storage and record counters are committed in the same serializable PostgreSQL transaction as record changes. Lifecycle job quotas are checked in the durable job transaction before queue submission.

## Failure behavior

- Request and export-rate exhaustion returns HTTP 429.
- Concurrency exhaustion returns HTTP 503 and does not enter extension code paths.
- Storage and record exhaustion returns HTTP 413 and rolls back the record transaction.
- Lifecycle-job exhaustion rejects the submission before a durable job or queue item is created.
- Failed, cancelled, and successful requests all release concurrency reservations.
- Quota violations upsert `RESOURCE_QUOTA` alerts keyed by school, extension, and quota type. Repeated violations increase occurrence counts and criticality for noisy-neighbor investigation.

## Counter integrity

School counters are backfilled from authoritative `ExtensionRecord` rows. Runtime create, update, delete, migration, rollback, uninstall purge, scheduled purge, and full extension purge maintain school and installation counters transactionally. Database constraints prevent negative persisted counters.

## Operating policy

Raise limits only after reviewing per-school and per-extension metrics. Do not use quota increases to mask repeated violations. A repeated violator should be investigated and, when necessary, controlled through the extension circuit breaker or kill switches.
