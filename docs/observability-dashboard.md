# Platform observability dashboard

Platform administrators use `/platform/observability` for a 60-minute operational snapshot. The page refreshes every 30 seconds and combines:

- distributed API request volume, 5xx error rate, availability, average, p95 and maximum latency;
- per-replica in-flight requests, peak concurrency, heap, and RSS saturation;
- PostgreSQL probe latency and current, active, and maximum connection counts;
- Redis and private R2 probe status and latency;
- BullMQ depth, oldest queued work, failure counts, and registered worker count;
- top schools and extension installations by extension-owned bytes and records.

HTTP RED buckets are minute-keyed in Redis and expire after two hours. Each API replica contributes to the same counters. If Redis is unavailable, request handling remains available and the local replica retains a bounded fallback window; the dashboard also reports Redis unhealthy. Metrics contain opaque IDs and counts only.

Existing `/platform/usage` and school usage trends remain the long-term per-school dashboard. Extension API telemetry and resource quotas remain visible in Platform Extensions. The observability page links these concerns into one live operator view without replacing durable daily rollups.

If the metrics path increases load, remove the observability page from navigation and roll back the API image. The Redis keys are ephemeral and require no data migration rollback.
