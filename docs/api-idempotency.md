# API Idempotency

Clients may make any `POST`, `PUT`, `PATCH`, or `DELETE` request safely
retryable by sending an `Idempotency-Key` header containing 8–200 letters,
numbers, dots, underscores, colons, or hyphens. Generate a fresh UUID for each
logical mutation and reuse it only when retrying that mutation.

The distributed key scope includes school, authenticated user, method, and URL.
The request body fingerprint prevents accidental reuse with a different payload.
Redis atomically reserves the key before controller execution:

- Concurrent duplicate while processing returns `409`.
- Reuse with a different payload returns `409`.
- Successful replay returns the original body and status with
  `Idempotency-Replayed: true`.
- Failed controller execution releases the reservation so a retry can proceed.

Completed responses are retained for `IDEMPOTENCY_TTL_MS` (24 hours by
default). Responses larger than `IDEMPOTENCY_MAX_RESPONSE_BYTES` (256 KiB by
default) are rejected rather than retained partially. Production requires the
same TLS Redis service used by distributed throttling.

A Redis 7 two-client rehearsal proved that only one client acquires a shared
reservation and that the other reads the completed response. Rollback is
removing the global interceptor; `idempotency:*` keys expire naturally and are
independent from BullMQ and rate-limit keys.
