# ADR 0006: Backup Retention and Deletion

- Status: Accepted
- Date: 2026-08-10

## Decision

School backups are asynchronous, encrypted, tenant-prefixed objects with checksums and immutable retention metadata. Default retention is 30 daily restore points and 12 monthly restore points. Payment evidence and audit retention follow their legal policy rather than backup retention.

School deletion enters `DELETION_SCHEDULED`, disables access, creates a final verified export when policy permits, and waits 30 days before irreversible purge. Legal hold blocks purge. Purge removes PostgreSQL rows, R2 prefixes, cache entries, domains, credentials, and derived analytics, and emits a platform audit receipt containing counts but no deleted content.

Restore always targets an isolated staging scope first, verifies checksums/schema/tenant identity, and requires an authorized promotion action.

## Rollback

Deletion can be cancelled before purge unless legal or security policy requires immediate removal. Completed purge is irreversible except from a separately retained lawful backup.
