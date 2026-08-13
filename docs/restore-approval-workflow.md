# Restore verification and approval

Logical recovery is a controlled state machine. The former `POST /backup/import` endpoint and arbitrary JSON upload UI have been removed; no school administrator can directly wipe live tenant data.

## State machine

1. A school administrator selects one of that school's immutable `AVAILABLE` exports and creates an idempotent restore request.
2. The operations worker enters `VERIFYING` and reads the private R2 object without writing application data.
3. Verification recomputes SHA-256, enforces the 200 MB and one-million-row bounds, requires snapshot version 2, permits only the explicit restore model allowlist, validates every row shape, and rejects any foreign `schoolId`.
4. A structured report records checksum, byte size, model and row counts, per-model counts, verified school, timestamp, and the `READ_ONLY_WORKER` isolation mode. Success enters `VERIFIED`; failure enters `REJECTED`.
5. A platform administrator who is not the requester records a 10–500 character approval reason. A compare-and-set transition moves only `VERIFIED` to `APPROVED`.

Every request, verification, rejection outcome, and approval is durable. Request, verification, and approval events are written to the target school's audit trail. RLS and explicit database grants cover both restore requests and exports.

## Safety boundary

Execution requires a third platform administrator who is neither requester nor approver, exact target-school confirmation, and a change ticket. The worker re-verifies source bytes after approval, validates internal installation references and current global extension/version references, and writes an immutable 30-day pre-restore safety export before opening a transaction. It uses explicit child-first deletion and parent-first insertion—never raw SQL or disabled foreign keys—and forces every restored row to the approved tenant ID. Operational history, routing domains, telemetry, audit logs, jobs, and recovery metadata are outside the logical snapshot contract. User identities are non-destructively upserted so restoration cannot cascade-delete global publisher memberships; active refresh and reset tokens are invalidated.

The transaction updates the durable request to `COMPLETED` atomically with school content. Any validation, R2, referential, uniqueness, or database failure rolls back all content writes and records `FAILED` plus an audited bounded error.

## Rollback

Disable the execute endpoint or operations worker to stop new restores. A failed transaction leaves live content unchanged. For an operator-approved rollback after a successful restore, submit the automatically created `pre-restore:<restoreId>` safety export through the same verification and three-person approval workflow. Do not restore the removed direct import endpoint.
