# Telemetry correlation

API and worker processes emit one-line JSON logs through the shared `JsonLogger`. Every record includes timestamp, severity, service, logger context, and safe correlation dimensions when available.

The API accepts bounded `x-request-id` and `x-trace-id` headers or generates UUIDs, returns both headers, and propagates the trace ID into queued job envelopes. Workers restore trace, job, school, and actor context before executing a handler. HTTP completion records include method, route template, status, duration, and outcome.

Safe dimensions are request ID, trace ID, job ID, school ID, user ID, extension ID, version ID, installation ID, release ID, service, route, and outcome. Password, authorization, cookie, token, secret, API-key, and private-key fields are recursively redacted. Values are depth, length, and collection bounded; request or job payloads are not logged by default.

Search by `traceId` to follow an API command into a worker. Search by `requestId` or `jobId` for one execution. School and extension identifiers support incident scoping without logging school names, emails, payment evidence, package contents, or record payloads.

If structured logging causes an incident, roll back the application image. Correlation headers and job envelope trace IDs are additive and remain compatible with older workers.
