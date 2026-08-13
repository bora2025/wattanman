# Redis and queue incident runbook

**Owner:** Reliability Owner. **Page:** `DEPENDENCY_HEALTH:REDIS`, zero workers, queue depth 2,000, or oldest job 30 minutes.

## Triage

1. Capture alert fingerprints, queue name, depth, oldest age, failed count, registered workers, deployment IDs, and representative job IDs. Job payloads may contain identifiers; do not paste payload content into tickets.
2. Determine whether Redis is unavailable, workers are absent, one job type is poison-retrying, consumers are slow, or producers are flooding.
3. Confirm API health separately. Redis failure must not be mistaken for PostgreSQL failure.

## Containment

1. Stop the faulty producer or roll back its release before adding consumers.
2. Preserve failed jobs and dead-letter evidence. Do not flush Redis, delete a queue prefix, or replay all failures during triage.
3. Pause only the affected worker service when retries can amplify external writes. Keep unrelated queues available.
4. If credentials may be exposed, provision a replacement Redis credential, update all producers and consumers, verify connectivity, then revoke the old credential.

## Recovery

1. Restore Redis/provider connectivity and deploy at least one healthy consumer for each of `operations`, `extensions`, `notifications`, and `school-deletions` when that queue has work.
2. Use the platform queue replay endpoint only for bounded, inspected failed jobs. Replay preserves idempotency keys; never rewrite job envelopes manually.
3. Scale consumers gradually while monitoring database connections, external dependency limits, queue age, and duplicate side effects.
4. For an unrecoverable Redis dataset, recreate queues and reissue durable work only from database states such as pending backup, restore, lifecycle, report, and deletion records.

## Verification and closure

All queues require workers, falling depth/age, no accelerating failures, and idempotent completion evidence. Run queue envelope, replay, worker processor, and health-monitor tests before closure. Record lost ephemeral jobs, reconstructed durable jobs, duplicate checks, RTO, and follow-up controls.
