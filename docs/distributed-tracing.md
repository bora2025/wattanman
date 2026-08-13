# Distributed tracing

Wattaman initializes the OpenTelemetry Node SDK before NestJS, database, Redis, HTTP, or worker modules load. Automatic instrumentation creates server, client, PostgreSQL, Redis, and supported library spans. Lifecycle workers create explicit BullMQ consumer spans.

Configure every API and worker service with the same collector and environment:

```text
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://collector.example/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20REDACTED
OTEL_SERVICE_NAME=wattaman-api
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.10
```

Use distinct `OTEL_SERVICE_NAME` values for the API, operations worker, extension worker, and notification worker. Production should send OTLP over TLS to an OpenTelemetry Collector. The SDK stays disabled when no OTLP endpoint is configured, so a collector incident cannot prevent startup. Set `OTEL_SDK_DISABLED=true` for emergency rollback without changing the application image.

Incoming W3C trace context is continued automatically. Queue producers inject `traceparent` into the versioned job envelope, and workers extract it before starting a consumer span. API responses expose `x-request-id` and the active OpenTelemetry `x-trace-id`, allowing operators to move between application logs and traces.

Only opaque identifiers and operational outcomes are attached to spans. Names, emails, tokens, payment evidence, extension records, request bodies, and job payloads are excluded. Health probes and filesystem calls are not instrumented to control noise and cost.
