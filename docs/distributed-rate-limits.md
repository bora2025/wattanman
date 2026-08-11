# Distributed Rate Limits

The API uses one atomic Redis Lua counter per rate-limit dimension. Every API
replica therefore contributes to the same limits instead of maintaining a
process-local counter.

| Dimension | Default per minute | Tracker |
| --- | ---: | --- |
| IP | 300 | Express trusted client IP |
| User | 240 | SHA-256 prefix of the authorization credential |
| School | 1,200 | Resolved school ID or normalized tenant host |
| Extension | 600 | Extension key plus school |
| Sensitive action | 30 | Credential plus mutating route; five-minute block |

Configure limits with `RATE_LIMIT_IP_PER_MINUTE`,
`RATE_LIMIT_USER_PER_MINUTE`, `RATE_LIMIT_SCHOOL_PER_MINUTE`,
`RATE_LIMIT_EXTENSION_PER_MINUTE`, and `RATE_LIMIT_SENSITIVE_PER_MINUTE`.
Extension limits apply only to extension routes; sensitive limits apply only to
non-GET/HEAD/OPTIONS requests.

Production startup fails unless `REDIS_URL` is present and uses `rediss://`.
Redis errors fail closed in production. Tests and local development may use the
bounded in-process fallback when Redis is intentionally absent; this fallback
must never be used as production capacity.

The Redis 7 rehearsal verified the first request was allowed and the second was
blocked for a limit of one, with independent window and block TTLs. Rollback is
redeploying the preceding API image; existing `throttle:*` keys expire naturally
and can be deleted by prefix during an incident without affecting BullMQ keys.
