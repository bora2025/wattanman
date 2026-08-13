# School deletion workflow

School deletion is an asynchronous platform recovery operation, not a direct CRUD delete.

1. A platform admin opens the school and requests deletion with the exact school name and a reason.
2. A different platform admin approves the request. Any active legal hold blocks request, approval, and execution.
3. A third platform admin confirms the exact school ID and supplies an approved change ticket.
4. The `school-deletions` worker validates report signing before mutation, discovers and deletes all private objects under the school's billing, backup, and extension-purge-report prefixes, and relists every prefix to verify it is empty.
5. The worker records pre-deletion row counts, cascade-deletes the school, and verifies every tenant-scoped model has zero rows for that school.
6. A surviving control-plane record and immutable private R2 document preserve the canonical payload, SHA-256 checksum, Ed25519 signature, actors, ticket, database counts, storage counts, and verification outcomes.

Use dedicated `SCHOOL_DELETION_REPORT_KEY_ID` and `SCHOOL_DELETION_REPORT_PRIVATE_KEY_BASE64` variables. During key migration, the service can use the existing extension purge report key as a fallback. Keep private keys only in Railway service variables.

The platform recovery page polls request state and exposes the signed report through a five-minute private download URL after completion. Failed jobs retain bounded errors and retry safely; completed jobs are idempotent.
