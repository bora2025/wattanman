# Destructive cleanup migration rehearsal

Run this only against an isolated PostgreSQL database restored from an authorized production-sized custom-format backup. The runner resets the marked target, validates the archive, restores it, applies the complete Prisma migration chain, verifies obsolete-table removal and retained row counts, restores the backup again as rollback proof, verifies every original table count, and finally drops all restored data.

Required environment:

- `DESTRUCTIVE_REHEARSAL_DATABASE_URL`: dedicated database whose hostname or database name contains `rehears`, `restore`, `staging`, `performance`, or `perf`; it must differ from `DATABASE_URL`.
- `DESTRUCTIVE_REHEARSAL_BACKUP_PATH`: local PostgreSQL custom-format archive.
- `DESTRUCTIVE_REHEARSAL_MIN_BYTES`: approved production-sized restored database threshold; defaults to 1 GiB.
- `DESTRUCTIVE_REHEARSAL_AUTHORIZATION=I_AUTHORIZE_DESTRUCTIVE_ISOLATED_REHEARSAL`.
- `DESTRUCTIVE_REHEARSAL_SIGNING_PRIVATE_KEY_PEM` and `DESTRUCTIVE_REHEARSAL_SIGNING_KEY_ID`: dedicated Ed25519 evidence key.
- PostgreSQL `pg_restore` available on `PATH`, or `PG_RESTORE_EXECUTABLE` set to its exact path.

From `backend`:

```powershell
npm.cmd run build
npm.cmd run db:cleanup:rehearse -- ..\evidence\destructive-cleanup.json
```

Archive the signed report outside the application environment. Independently verify it with the matching public key:

```powershell
$env:DESTRUCTIVE_REHEARSAL_SIGNING_PUBLIC_KEY_PEM = Get-Content .\rehearsal-public.pem -Raw
npm.cmd run db:cleanup:verify -- ..\evidence\destructive-cleanup.json
```

The command never connects to a source production database. PostgreSQL passwords remain in the child environment rather than process arguments. Output contains hashes and counts, never rows, SQL output, credentials, or backup contents. A failed run attempts the same schema cleanup and does not emit a passing report. Keep the TODO open until a real production-sized backup produces a verified signed report and an independent reviewer approves it.
