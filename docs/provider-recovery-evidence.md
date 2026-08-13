# Provider recovery evidence

The PostgreSQL PITR, encrypted provider backup, RPO, and RTO gates require fresh, independently signed evidence. A
dashboard screenshot is not sufficient. Record only provider metadata and measurements; never include database URLs,
credentials, SQL, customer rows, or backup contents.

## Required input

Create a JSON input containing `schemaVersion: 1`, provider `RAILWAY`, environment `production`, the Railway project and
database service UUIDs, a change ticket, and an observation timestamp no older than seven days. Record:

- PITR enabled state, retention of at least 24 hours, and latest available recovery-point timestamp.
- Latest encrypted and verified provider backup completion timestamp, no older than 24 hours.
- An isolated restore rehearsal's start, selected recovery point, recovery completion, integrity result, and cleanup result.

The preparer derives recovery-point lag, measured RPO, and measured RTO and rejects values over 15 and 60 minutes.

## Approval workflow

1. Build and run `npm run recovery:evidence:prepare -- input.json payload.json` from `backend`.
2. An infrastructure owner signs with `RECOVERY_EVIDENCE_PRIVATE_KEY_PEM` and role `INFRASTRUCTURE_OWNER`.
3. A different reliability owner signs the identical payload with role `RELIABILITY_OWNER`.
4. Combine `payload` and both approvals into one document and verify it with
   `npm run recovery:evidence:verify -- document.json trusted-reviewers.json`.
5. Archive the verified output, provider audit event, and change ticket in the restricted operations evidence store.

Private keys must remain in each approver's secret manager and must never be committed or shared between approvers.
The TODO gates remain open until this verifier returns `VERIFIED` for current production evidence.
