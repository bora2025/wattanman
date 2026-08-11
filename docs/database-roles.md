# Database Roles

Provision the accepted ADR 0002 group roles once per environment with a database owner or provider administration URL:

```powershell
$env:DATABASE_ADMIN_URL = '<provider-admin-postgresql-url>'
Set-Location backend
npm run db:roles:provision
```

The command is idempotent, serialized by a PostgreSQL advisory lock, and verifies role attributes after applying grants.

- `wattaman_migration`: schema creation and all table/sequence privileges; never used by API containers.
- `wattaman_control_plane`: CRUD and the only `BYPASSRLS` group; used solely by audited platform operations.
- `wattaman_school_runtime`: CRUD without RLS bypass; used by school API and tenant workers.
- `wattaman_analytics`: read-only without RLS bypass.

Create provider-managed LOGIN identities separately, grant each identity exactly one group role, and store its URL only in the corresponding Railway service. Each URL must assume its group with the PostgreSQL connection option `options=-c role=<group-role>`; role attributes such as `BYPASSRLS` are not inherited without `SET ROLE`. Do not place `DATABASE_ADMIN_URL` in an application service.

Configure `DATABASE_URL` with a LOGIN inheriting `wattaman_school_runtime`. Configure `CONTROL_PLANE_DATABASE_URL` with a different LOGIN inheriting `wattaman_control_plane`. Domain resolution and audited platform operations use the control-plane pool; school HTTP transactions use the runtime pool. Production RLS activation must not proceed while both variables point to the same identity.

Rollback is `REVOKE`-first: revoke a login identity's group membership and rotate its password. Do not drop group roles while grants, policies, or active sessions depend on them. RLS activation is a separate migration and is not rolled back by removing a role.
