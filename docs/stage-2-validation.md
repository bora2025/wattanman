# Stage 2 Production Validation

## API replicas

On 2026-08-11 the production `wattanman` API was scaled to three Southeast
Asia replicas. Railway deployment `6787d681-d942-46fa-a11f-2e7d26de6641`
reported `numReplicas: 3`, and 20 consecutive public readiness requests
returned `ready`.

## Migration serialization

Two copies of `node prisma/release-migrate.js` were started concurrently
against the production database through Railway's public database proxy. Both
completed successfully with no pending migration and logged acquisition of
advisory lock `864220261`. Runner durations were 3,551 ms and 6,093 ms while
wall time was 6,368 ms, demonstrating that one runner waited while the other
held the transaction lock instead of migrating concurrently.

No database credentials were written to logs or files. A temporary Railway SSH
key attempted for private-network execution was removed from Railway and the
local machine after SSH proved unavailable.

## Scheduled task deduplication

Every retained `@Cron` method is covered by a source registry and claims a
Redis time-bucket key before performing work. A two-replica concurrency test
uses independent guard instances sharing one Redis-compatible state and proves
exactly one winner; service tests prove losing replicas perform no database
scan or side effect.
