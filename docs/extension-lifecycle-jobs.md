# Extension Lifecycle Jobs

Installing, upgrading, rolling back, activating, deactivating, uninstalling,
and purging an extension installation or extension no longer run inside the
HTTP request. Each command creates an `ExtensionLifecycleJob` row
(`INSTALL | UPGRADE | ROLLBACK | ACTIVATE | DEACTIVATE | UNINSTALL |
PURGE_INSTALLATION | PURGE_EXTENSION`), enqueues a `{ jobId }` pointer on the
existing `extensions` BullMQ queue as an `extension.lifecycle.execute`
envelope, and returns the job row with HTTP `202`. The extension worker
executes it; clients poll `GET .../jobs/:jobId` until `status` is
`SUCCEEDED` or `FAILED` (the shared web client's `waitForLifecycleJob`
helper does this on a 1-second interval).

The job row is unique on `(schoolId, idempotencyKey)`, reusing the same
`Idempotency-Key` header required on every one of these routes
(docs/api-idempotency.md) — a retried submission with the same key and
payload returns the existing job rather than creating a second one; reuse
with a different command or payload is rejected.

Execution claims the job with a guarded `updateMany` (`QUEUED`/`FAILED`, or
`RUNNING` past `EXTENSION_LIFECYCLE_STALE_MS` — default 300 seconds — or
behind the current BullMQ attempt), so a stalled worker's job can be safely
reclaimed by a retry without two workers executing it at once. Execution
itself runs inside a distributed lock (`EXTENSION_COMMAND_LOCK_MS`, default
120 seconds) on `school:<schoolId>:extension:<extensionId>` for installation
commands, or `extension:<extensionId>` for `PURGE_EXTENSION` — the same
resource-key convention used by every other extension command lock in this
codebase.

`PURGE_INSTALLATION` and `PURGE_EXTENSION` treat a `NotFoundException` on
execution as an already-purged success rather than a failure: if a prior
attempt already deleted the row before a retry fires (e.g. the worker
crashed after the delete but before marking the job `SUCCEEDED`), the retry
finds nothing to delete and that is the correct outcome, not an error.

Install and rollback are idempotent no-ops when the installation is already
at the target version; uninstall is a no-op when already `UNINSTALLED`. This
is what makes it safe for BullMQ to retry a job whose underlying command
already completed.

## Progress visibility

`schoolInstallations()` and `platformInstallations()` attach `lastJob` (the
most recent `ExtensionLifecycleJob` per installation, batched via one
`DISTINCT ON` query) so a page reload or a second operator can see an
in-flight or failed command — `waitForLifecycleJob` on the frontend only
covers the tab that submitted it. Both admin pages poll every 2 seconds
while `lastJob.status` is `QUEUED`/`RUNNING`, reusing the same interval
pattern already used for package validation progress. A cursor-paginated
`GET .../:id/jobs` history endpoint exists on both the platform and school
controllers for the full per-installation command history.

## Signed purge reports

`PURGE_INSTALLATION` and `PURGE_EXTENSION` generate a signed
`ExtensionPurgeReport` on success (skipped on the already-purged retry
branch, and skipped for a core-module retire, which isn't a physical
delete). The scheduled uninstall-grace-period cron
(`extension-cleanup.service.ts`) generates the same kind of report,
`trigger: 'SCHEDULED'`, for each installation it purges.

Reports are signed with a platform-owned Ed25519 key — `EXTENSION_PURGE_REPORT_KEY_ID`,
`EXTENSION_PURGE_REPORT_PRIVATE_KEY_BASE64`, `EXTENSION_PURGE_REPORT_PUBLIC_KEY_BASE64` —
deliberately separate from `EXTENSION_SIGNING_*` (publisher package-trust
keys, a different trust domain with its own DB-tracked rotation and
revocation table). This is intentionally a single static platform identity,
not DB-tracked or rotatable-with-revocation-status: the point of a signed
report is that a downloaded copy verifies standalone against the documented
public key, with no API or database dependency. Rotate it manually by
generating a new pair, updating the three env vars, and restarting; keep the
old public key on file indefinitely so historical reports stay verifiable.

To verify a downloaded report: `JSON.parse` it, `JSON.stringify(parsed.payload)`
to reconstruct the exact bytes that were signed (V8 preserves key insertion
order on both ends, so no separate canonicalization step is needed), then
verify that buffer against `parsed.signature` (base64) with Node's
`crypto.verify(null, buffer, publicKey, signature)` using the documented
public key.

Known limitation on the scheduled path: if the database delete for an
installation succeeds but report generation then throws (signing
misconfigured, R2 unavailable), the row is already gone and cannot be
retried for reporting. This surfaces as a `WARN` log naming the installation
and as a purge-count vs. report-count mismatch an operator can reconcile via
audit logs — not a silently swallowed failure.
