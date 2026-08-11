# Queue Operations

Wattaman uses managed Redis with TLS and high availability plus BullMQ. Redis coordinates delivery, retries, leases, and dead-letter queues; PostgreSQL remains authoritative for business state.

## Configuration

- `REDIS_URL` is required for API or worker processes that instantiate queue infrastructure. Production requires `rediss://`.
- `QUEUE_WORKER_CONCURRENCY` defaults to 5.
- `QUEUE_JOB_LOCK_MS` defaults to 30 seconds and BullMQ renews active locks as the worker heartbeat.
- `QUEUE_STALLED_INTERVAL_MS` defaults to 15 seconds; a job may stall twice before failure.

## Delivery Policy

- Jobs use a versioned envelope with tenant scope, actor, trace, and idempotency identity.
- Idempotency keys become deterministic BullMQ job IDs.
- Jobs receive eight attempts with exponential backoff beginning at one second.
- Terminal failures are copied to `<queue>.dead-letter` with source identity, attempts, timestamp, and error details.
- Operators replay only after correcting the cause and preserving the original idempotency key.

## Distributed Leases

Lease acquire uses Redis `SET NX PX`. Renew and release use compare-owner Lua scripts, preventing one worker from releasing another worker's lock. School and extension operations use stable keys such as `school:<id>:backup` or `installation:<id>:migration`.

## Required Alerts

Monitor queue depth, oldest waiting-job age, failure rate, dead-letter count, stalled jobs, and lease loss. Alert thresholds are defined per queue based on its service objective.
