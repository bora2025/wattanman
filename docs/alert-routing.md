# Paging and ticket alerts

The extension worker evaluates the live observability snapshot every five minutes under a distributed scheduler lease. Conditions are persisted in the existing operational alert ledger, deduplicated by fingerprint, visible on `/platform/observability`, and automatically resolved when the next scan is healthy.

## Routing policy

| Signal | Ticket | Page |
| --- | --- | --- |
| API, 15 minutes and at least 100 requests | Availability below 99.9% or p95 at least 1 second | Availability below 99% or p95 at least 2.5 seconds |
| PostgreSQL, Redis, or R2 | — | Health probe fails |
| Queue depth | At least 500 | At least 2,000 |
| Oldest queued job | At least 5 minutes | At least 30 minutes |
| Failed queue jobs | At least 10 | — |
| Registered workers | — | Zero |

Configure `PAGING_WEBHOOK_URL` and `TICKET_WEBHOOK_URL` on the extension worker. Production URLs must use HTTPS. Payloads contain alert ID, fingerprint, opaque resource identifiers, threshold values, routing class, and message; they never contain request bodies, school names, email addresses, tokens, or extension record data. The fingerprint is also sent as an idempotency key.

New, recovered, escalated, and every sixth continuing occurrence are delivered. This suppresses five-minute duplicates while retrying a failed or long-running incident every 30 minutes. When a webhook is not configured, the same structured event is emitted at error severity for Railway or the log platform to route.

Acknowledgement and resolution remain available through Platform Extensions alerts. Automatic recovery sets `resolvedBy=SYSTEM`. During a routing-provider incident, point the webhook to a replacement HTTPS receiver or rely on structured log routing; alert persistence continues independently.
