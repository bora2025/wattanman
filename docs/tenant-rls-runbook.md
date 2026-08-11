# Tenant Row-Level Security Runbook

Migration `20260811000001_install_tenant_rls_policies` installs one deny-by-default `USING` and `WITH CHECK` policy on every tenant-owned table. It deliberately does not activate RLS until connection identities are verified.

## Activate

1. Provision roles with `npm run db:roles:provision`.
2. Create distinct provider LOGIN identities and grant exactly one group to each.
3. Append `options=-c%20role%3Dwattaman_school_runtime` to the runtime URL and `options=-c%20role%3Dwattaman_control_plane` to the control URL.
4. Configure API and worker `DATABASE_URL` and `CONTROL_PLANE_DATABASE_URL` with those URLs.
5. From the migration/release environment only, run:

```powershell
$env:DATABASE_ADMIN_URL = '<migration-or-owner-url>'
$env:RLS_RUNTIME_DATABASE_URL = '<runtime-login-url-with-set-role>'
$env:RLS_CONTROL_PLANE_DATABASE_URL = '<control-login-url-with-set-role>'
Set-Location backend
npm run db:rls:activate
```

Activation aborts before changing tables unless the runtime connection has `BYPASSRLS=false`, the control connection has `BYPASSRLS=true`, and each connection has explicitly assumed the expected group role. It then enables and forces RLS under an advisory lock and verifies every policy.

## Policy

Policies compare each row's `schoolId` to `current_setting('app.current_school_id', true)`. Missing or empty settings match no rows and permit no writes. School requests set the value transaction-locally. Raw SQL receives the same database enforcement as Prisma delegates.

## Verify

`npm run test:rls` proves absent-scope denial, per-school raw reads, rejected cross-school raw writes, FORCE RLS state, and explicit control-plane access. CI additionally runs HTTP tenant isolation and the full extension lifecycle with the application connected through runtime/control identities after activation.

## Emergency Response

Do not disable RLS during ordinary rollback. Roll forward the application while retaining policies and transaction scope. If an audited emergency requires disabling a policy, use the migration identity, capture the incident and exact table list, restrict application traffic first, and re-enable both `ENABLE` and `FORCE ROW LEVEL SECURITY` before reopening traffic.
