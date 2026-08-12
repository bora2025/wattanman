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
