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

`APPROVED` is intentionally not execution. Live execution remains fail-closed until the school-scoped restore executor creates a pre-restore safety export, validates referential compatibility, uses an explicit dependency order, and proves another tenant cannot change. The platform recovery UI clearly reports this lock.

## Rollback

This slice contains no live-data mutation. Rollback consists of disabling restore request creation and worker verification; existing verification evidence can remain for audit. Do not restore the removed direct import endpoint.
