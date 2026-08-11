# External Dependency Circuit Breakers

R2, SendGrid email, Twilio SMS, Railway GraphQL, and external image fetches use
the shared `CircuitBreakerService`. Production state is stored in Redis so all
API and worker replicas observe the same failures and open state.

The default policy opens a dependency after five consecutive failures, rejects
direct synchronous calls with HTTP 503 for 30 seconds, and then permits one
distributed half-open probe. Best-effort wrappers may translate that failure
to their documented degraded result. A successful probe clears the state; a
failed probe reopens the circuit. Successful calls also reset earlier transient
failures.

Configuration:

- `CIRCUIT_BREAKER_FAILURE_THRESHOLD` defaults to `5`.
- `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` defaults to `30000`.
- `REDIS_URL` is mandatory in production and must use TLS or Railway private
  networking.

Rollback removes the provider wrapper while retaining the shared service. Do
not disable breakers during an outage; temporarily raise thresholds only with
an incident record and restore defaults after provider recovery.
