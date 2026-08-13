# Quarterly restore rehearsal

Run the disposable restore rehearsal once per quarter and after any material recovery change:

```powershell
$env:CONFIRM_DISPOSABLE_RESTORE_REHEARSAL='YES'
npm.cmd run db:restore:rehearse
```

Run it from the backend production image with production-equivalent PostgreSQL, Redis, and private R2 credentials. Schedule it for January, April, July, and October in a dedicated Railway cron service; do not run concurrent rehearsals.

The command creates a uniquely named disposable school, administrator, and marker post; exports it; mutates the marker; performs read-only verification; records an independent synthetic approval; executes the same tenant-scoped restore service; validates the original marker; verifies the pre-restore safety export; then removes the disposable school and both R2 objects. It writes a `RESTORE_REHEARSAL` audit event on the platform sentinel and emits one JSON report containing IDs, outcome, RPO, restore duration, total duration, and completion time.

Success criteria:

- outcome is `PASSED`;
- the restored marker matches the source export;
- the safety export exists before execution;
- `rpoSeconds <= 900` and `restoreSeconds <= 3600`;
- no disposable school or rehearsal R2 object remains;
- the platform audit event exists.

Any failure is an incident ticket. Preserve logs and correlation IDs, disable restore execution if integrity failed, and rerun only after root-cause remediation.

## Rehearsal history

- 2026-08-13 — `restore-rehearsal-1786602564117`: `PASSED`; RPO 0 seconds; restore 5 seconds; total 10 seconds; database and both private R2 objects verified removed. Source export `cmsr51di900064pv0adkgspaj`, restore `cmsr51fog00084pv01y56gx80`, safety export `cmsr51ils000a4pv00y2npif5`.
