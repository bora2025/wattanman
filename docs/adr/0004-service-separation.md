# ADR 0004: API, Worker, and Migration Separation

- Status: Accepted
- Date: 2026-08-10

## Decision

Deploy the stateless HTTP API, asynchronous worker, and release migration runner as separate processes from one versioned codebase. API startup performs compatibility checks only. Exactly one release runner applies migrations under a PostgreSQL advisory lock. Workers consume durable queues and never expose public HTTP business endpoints.

Schedulers enqueue work rather than executing tenant operations in every API replica. Each process has a distinct database role and least-privilege environment variables.

## Rollback

Roll back API and workers independently only while schema compatibility permits. Migrations follow expand-and-contract rules and are normally rolled forward rather than reversed.
