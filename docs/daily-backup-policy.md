# Daily school backup policy

The extension worker schedules tenant-scoped logical backups at 01:15 UTC every day and retries incomplete scheduling
at 02:15 and 03:15 UTC. A Redis-backed hourly claim ensures only one worker replica runs each attempt. Active schools
are read in bounded cursor pages and each school receives the stable request key `daily-backup:YYYY-MM-DD`, making
retries safe after partial failure without creating another export.

Backup payloads are checksummed, written to private immutable Cloudflare R2 keys, retained for seven days, and protected
by R2 server-side encryption at rest. Download access uses five-minute SigV4 URLs. Restore still requires immutable
checksum verification, independent platform approval, and a separate executor.

## Operations

- Keep `DAILY_BACKUP_ENABLED` unset or set to `true` in production.
- Query `GET /platform/backup-restores/daily-policy` as a platform administrator after the queue drains.
- Require `coveragePct: 100`, `failed: 0`, and `healthy: true` before closing the daily control.
- Investigate failed queue jobs through the platform queue operations interface, then allow the idempotent scheduler or
  an approved school export request to retry.
- Run the quarterly restore rehearsal against a selected daily export; scheduling success alone is not restore proof.

PostgreSQL point-in-time recovery is a separate infrastructure control and must be enabled and evidenced at the
database provider before its TODO gate can close.
