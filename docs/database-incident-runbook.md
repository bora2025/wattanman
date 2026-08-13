# PostgreSQL incident runbook

**Owner:** Infrastructure Owner. **Page:** `DEPENDENCY_HEALTH:DATABASE` or API availability below 99%. **Targets:** RPO 15 minutes, RTO 60 minutes.

## Triage

1. Open Platform → Observability and record the alert ID, first-seen time, API error rate, connection counts, affected deployment IDs, and correlation IDs. Never paste connection URLs into the ticket.
2. Check Railway PostgreSQL metrics, deployment events, storage, connections, and backup/PITR status. Distinguish saturation, provider outage, bad migration, credential failure, and data integrity failure.
3. Declare severity: SEV-1 for unavailable/corrupt cross-school service or suspected data loss; SEV-2 for degraded capacity with safe reads/writes; SEV-3 for isolated non-production impact.
4. Freeze migrations, restore execution, school deletion, and releases until the incident commander records a safe path.

## Containment

1. For connection saturation, stop retry storms before scaling: pause nonessential workers, preserve one operations worker for recovery, and roll back the offending application release.
2. For a failed additive migration, do not edit `_prisma_migrations` or use `db push`. Restore the previous application image and create a forward-only repair migration.
3. For suspected tenant leakage or corruption, restrict application traffic, preserve database/log evidence, and follow `tenant-isolation-incident-runbook.md`.
4. Never disable foreign keys, RLS, or `FORCE ROW LEVEL SECURITY` to restore availability.

## Recovery

1. Prefer provider recovery or application rollback when integrity is intact.
2. If recovery requires data restoration, select the newest verified recovery point before the incident, restore to a sibling database/service, and validate it without redirecting production traffic.
3. Run `npm.cmd run db:schema:check`, database identity tests, RLS tests, and the quarterly restore rehearsal against the candidate environment.
4. Compare school count, tenant row counts, latest audit timestamps, extension installations, and checksum evidence. A second operator approves cutover and records the recovery point and measured RPO.
5. Rotate database credentials if exposure is possible, update API and every worker atomically, then revoke old credentials.

## Verification and closure

Health must remain green for 30 minutes; queue age must fall; representative school reads/writes and cross-tenant denial must pass; no migration drift may remain. Record measured RPO/RTO, affected schools by opaque ID, root cause, timeline, evidence locations, and follow-up owners. Re-enable paused jobs gradually.
