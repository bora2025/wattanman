# Transaction-Local Tenant Scope

School HTTP requests run inside one Prisma interactive transaction. `TenantDatabaseInterceptor` reads the verified `tenantContext` and `PrismaService.runInTenantTransaction` executes:

```sql
SELECT set_config('app.current_school_id', '<school-id>', true);
```

The final `true` makes the setting transaction-local, so pooled connections cannot retain a tenant after commit or rollback. An AsyncLocalStorage-backed Prisma proxy routes existing model delegates, raw queries, and nested `$transaction` calls to the active transaction client without requiring feature services to inject a second client.

Audited platform requests use the separate unscoped control-plane path and are not placed in a school-runtime transaction. Health probes run without tenant or database transaction context.

## Limits

- Default transaction acquisition wait: 5 seconds (`TENANT_TRANSACTION_MAX_WAIT_MS`).
- Default request transaction timeout: 30 seconds (`TENANT_TRANSACTION_TIMEOUT_MS`).
- Streaming and long-running work must be converted to jobs rather than extending HTTP transaction duration.
- A callback cannot switch to another school while a transaction is active.
- Asynchronous audit and metric interceptors are awaited before request completion so they cannot outlive the transaction.

## Validation

`npm run test:database-scope` uses PostgreSQL to prove the setting, nested transaction reuse, rollback atomicity, automatic school scoping, and cross-school switch rejection. Tenant isolation and extension lifecycle E2E run after it in CI.

## Rollback

Application rollback may remove the interceptor and proxy only before RLS policies are enabled. Once RLS is active, retain this scoped transaction contract and roll forward. Never replace `SET LOCAL` with session-level `SET` on pooled connections.
