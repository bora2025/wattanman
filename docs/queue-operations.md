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
- `QUEUE_JOB_ATTEMPTS` and `QUEUE_JOB_BACKOFF_MS` retain those defaults and are
  configurable for controlled rehearsals; invalid or excessive values fail.
- Terminal failures are copied to `<queue>.dead-letter` with source identity, attempts, timestamp, and error details.
- Platform operators inspect one known dead letter with
  `GET /platform/queues/:queue/dead-letters/:jobId` and replay it with
  `POST /platform/queues/:queue/dead-letters/:jobId/replay` only after fixing
  the cause. Replay validates the original envelope, preserves its job and
  idempotency identities, removes only a terminal failed source, uses a
  distributed replay lease, and deletes the dead letter only after requeue.

## Distributed Leases

Lease acquire uses Redis `SET NX PX`. Renew and release use compare-owner Lua scripts, preventing one worker from releasing another worker's lock. School and extension operations use stable keys such as `school:<id>:backup` or `installation:<id>:migration`.

## Queue health alerts

The operations worker scans `extensions`, `operations`, and `notifications`
every minute. Configure another comma-separated set with
`QUEUE_MONITORED_NAMES`. Structured `queue_health_alert` events are emitted for
queue depth, oldest waiting/delayed/prioritized job age, and Redis scan failure.

- `QUEUE_DEPTH_WARNING` defaults to `500`; `QUEUE_DEPTH_CRITICAL` to `2000`.
- `QUEUE_OLDEST_JOB_WARNING_MS` defaults to five minutes.
- `QUEUE_OLDEST_JOB_CRITICAL_MS` defaults to thirty minutes.

Threshold configuration fails closed when critical is below warning. Route the
worker's structured error logs to the managed observability provider and page on
critical events. Rollback removes `JobsModule` from `WorkerModule`; this disables
monitoring only and does not mutate or drain queue contents.

## Required Alerts

Monitor queue depth, oldest waiting-job age, failure rate, dead-letter count, stalled jobs, and lease loss. Alert thresholds are defined per queue based on its service objective.
