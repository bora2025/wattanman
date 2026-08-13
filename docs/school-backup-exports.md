# School backup exports

School backups are tenant-scoped asynchronous jobs. The API never constructs or streams a backup in the request lifecycle.

## Flow

1. An authenticated school administrator sends `POST /backup/exports` with a unique `Idempotency-Key`.
2. The API creates one tenant-owned `BackupExport` record and enqueues `backup.export` on the `operations` queue.
3. The extension worker restores the school tenant context, builds the version 2 logical snapshot, computes SHA-256, and writes it to private R2 under `backups/schools/<schoolId>/<checksum>/<exportId>.json`.
4. Metadata changes to `AVAILABLE`; the object is retained for seven days.
5. `GET /backup/exports/:id/download` returns a private SigV4 URL valid for five minutes. The checksum and size are returned separately for verification.

R2 writes are immutable and checksum-addressed. Tenant middleware, Prisma scoping, PostgreSQL RLS, and a school-specific object prefix independently prevent one school from accessing another school's export. Request, completion, and download events are audited.

## Operations

- The `operations` queue must have an active extension worker.
- R2 private storage credentials are required by both API and extension worker.
- Failed jobs retain their durable status and bounded error message. Reusing the original idempotency key requeues a failed export.
- Export download expiry does not expose R2 publicly; administrators can request a fresh signed URL while the export record remains within retention.

Logical restore remains disabled from this asynchronous flow until isolated verification and explicit approval are implemented. The legacy import endpoint is temporary and must not be considered the production recovery path.
