# Tenant-isolation incident runbook

**Owner:** Security Owner and Platform Engineering Owner. Any confirmed cross-school read or write is SEV-1.

## Immediate containment

1. Record reporter, timestamp, route, source and target school IDs, user ID, request/trace IDs, deployment ID, and evidence location. Do not copy exposed record content into the ticket.
2. Restrict the affected route or application deployment. If scope is unknown, stop school traffic while retaining platform recovery access.
3. Revoke affected sessions and impersonation tokens. Suspend compromised accounts without deleting audit evidence.
4. Freeze migrations, restores, school deletion, extension installation/runtime changes, and retention cleanup.
5. Preserve logs, audit rows, database snapshots, request metadata, extension/version checksums, and relevant R2 objects under legal hold.

## Scope and investigation

1. Determine whether the path used Prisma, raw SQL, a control-plane client, backup/restore, extension resources, object storage, cache, search, or a custom domain.
2. Verify host-to-school resolution and JWT school/role claims. Identify the exact authorization and tenant-context boundary that failed.
3. Run HTTP tenant-isolation, database-scope, database-identity, and RLS test suites against a faithful isolated copy. Do not run destructive experiments on production.
4. Query audit/telemetry only by opaque school, user, extension, request, and trace IDs. Produce a bounded affected-school list for notification.
5. Check for writes separately from reads and verify backups/R2 prefixes; absence of API errors does not prove absence of exposure.

## Remediation

1. Fix the root boundary, not individual leaked records. Maintain deny-by-default tenant middleware, runtime database role, transaction-local `app.current_school_id`, RLS `USING`/`WITH CHECK`, and `FORCE ROW LEVEL SECURITY`.
2. Never disable RLS to recover. A control-plane operation must use an explicit platform guard, scoped authorization, audit evidence, and bounded query.
3. Restore corrupted tenant data only through the verified restore workflow with independent approval and a safety export.
4. Rotate credentials/tokens if authorization material was exposed; invalidate sessions for every affected school.

## Recovery, verification, and closure

Before reopening traffic, require a second reviewer and passing isolation, RLS, identity, lifecycle, and regression tests. Verify representative cross-school reads return no rows and writes fail at both application and database layers. Record affected schools/data classes, read/write window, notifications, legal/regulatory decisions, root cause, RPO/RTO where restoration occurred, and follow-up owners.
