# ADR 0003: Redis and Durable Queues

- Status: Accepted
- Date: 2026-08-10

## Decision

Use managed Redis with TLS and high availability for short-lived caches, distributed rate limits, leases, and BullMQ coordination. BullMQ is the durable job API; authoritative job state and business outcomes remain in PostgreSQL. Redis persistence uses AOF and provider-managed snapshots, but queues must tolerate Redis failover and replay.

Every job envelope contains schema version, job ID, type, tenant scope, actor, trace ID, idempotency key, attempt, and creation time. Workers use bounded exponential backoff with jitter, leases with heartbeat, dead-letter queues, and operator-controlled replay.

## Consequences

- API replicas do not execute long-running work inline.
- Job handlers must be idempotent and explicitly tenant-scoped.
- Queue depth, oldest age, failures, and lease loss are production alerts.

## Rollback

Queue consumers can be paused while API request paths remain available. PostgreSQL job state is used to reconcile and safely replay work after Redis recovery.
