# 1,000-school load-test preparation

## Deterministic fixtures

`npm.cmd run load:fixtures` streams sharded NDJSON plus a manifest. The default fixed seed and scale create 1,000 schools, 500,000 users, 8,000 installations, 320,000 extension records, 200,000 audit events, and 12,000 asset descriptors without holding the full dataset in memory. Every tenant-owned row carries an explicit synthetic school ID; `.invalid` domains and emails cannot receive traffic.

Use environment overrides only for bounded smoke fixtures. The manifest fingerprint proves two runs used the same seed and scale. Generated `load-fixtures/`, k6 `results/`, and credentials must remain untracked.

## Profiles

- `normal`: 250 requests/second for 30 minutes.
- `peak`: 1,000 requests/second for two hours, matching the sustained certification gate.
- `burst`: ramps to 3,000 requests/second and observes recovery.
- `failure`: 500 requests/second while an authorized operator injects one non-production dependency failure using its runbook.

The k6 thresholds require under 1% failures, p95 below one second, p99 below 2.5 seconds, over 99% checks, and zero dropped iterations. Publication, backup, validation, migration, dependency-failure, and abuse scenarios are separate Stage 6 orchestrations layered onto these profiles.

`LOAD_TEST_IDENTITIES_FILE` must contain short-lived synthetic identities spanning the requested school and session counts. Each identity has an opaque school ID, approved non-production school origin, and bearer token. Traffic exercises authenticated school routes and treats 401/403 as failures; credentials are never committed or written to result reports.

## Isolated database provisioning

Build the backend, set `LOAD_TEST_DATABASE_URL` to a dedicated database whose host or database name contains `loadtest`, `performance`, `perf`, or `staging`, set `LOAD_TEST_DATABASE_AUTHORIZATION=I_AUTHORIZE_DESTRUCTIVE_ISOLATED_LOAD_DATA`, and set `LOAD_TEST_JWT_SECRET` equal to that environment's `JWT_SECRET`. `LOAD_TEST_SCHOOL_ORIGIN_TEMPLATE` must contain `{subdomain}` and resolve to the isolated application. Then run `npm.cmd run load:provision`.

Provisioning aborts under `NODE_ENV=production`, against unmarked/Railway production databases, or when any non-platform/non-synthetic school exists. It creates verified domain mappings, realistic settings/assets, users, published synthetic extensions, installations, extension records, and audits in bounded batches, emits progress without credentials, verifies counts, and writes 10,000 three-hour JWT identities with owner-only permissions and exclusive creation. After evidence collection, set `LOAD_TEST_CLEANUP_CONFIRMATION=DELETE_ALL_SYNTHETIC_LOAD_DATA` and run `npm.cmd run load:cleanup`; cleanup uses the same guards and verifies no synthetic schools remain.

## Production guard

The script requires `LOAD_TEST_AUTHORIZATION=I_ACKNOWLEDGE_NON_PRODUCTION_ONLY`, a target hostname containing `loadtest`, `performance`, `perf`, or `staging` (or localhost), a healthy preflight, and a target that does not identify itself as production. It always rejects `wattaman.app` and Railway public domains. Use a dedicated isolated performance environment and database; never weaken the guard to test production.

## Cost evidence

Set the approved environment-hour, request, and transfer rates. `handleSummary` writes request/byte/duration totals, input rates, and estimated USD cost to `results/<run-id>-cost.json`. Attach that report with infrastructure metrics and provider invoices to the capacity review; estimates do not replace invoices.

## Certification evidence

Populate a copy of `load-test/certification-evidence.example.json` only from measured non-production outputs, then run `npm.cmd run load:verify -- <path>`. The verifier fails unless all Stage 6 scale, sustained/burst, concurrent-session, traffic-operation, dependency-limit, failure-injection, tenant-isolation, automatic-recovery, autoscaling, cost-approval, and next-threshold requirements are present and within approved limits. A passing checksum is evidence integrity, not a substitute for attached source metrics.

Prefer assembling the final document instead of populating it manually. The fixture command now provisions the isolated database and writes `provisioning.json`; k6 reports include configured and achieved throughput, availability, latency, dropped iterations, tail recovery, cost, session coverage, and an authenticated tenant-routing mismatch counter. Every tenant response carries `X-Wattaman-School-Id`, which k6 compares with the JWT identity's school. After the run, sign the exact JSON serialization of a completed `load-test/certification-approval-payload.example.json` with an offline Ed25519 key and wrap it as `{"payload":<payload>,"signature":"<base64>"}`. Set `LOAD_CERTIFICATION_APPROVAL_PUBLIC_KEY_PEM`, then run `npm.cmd run load:assemble -- <results-directory> <signed-approval.json> <evidence.json>`. The assembler rejects missing, cross-run, cross-target, tampered, incomplete, or failing artifacts and invokes the 23-gate verifier before writing evidence. Human autoscaling and cost approval remains intentionally external and signed; the assembler never invents it.

## Orchestration

Copy `load-test/certification-manifest.example.json`, replace remaining infrastructure failure-injection placeholders, and configure its output paths. Run `npm.cmd run load:run -- <manifest>`. The five concurrent lifecycle operations use `load-test/phases/*.example.json` through `npm.cmd run load:phase -- <phase> <evidence>` and cover publication submission, validation evidence, staged update, backup, and migration. Supply only synthetic non-production IDs through `LOAD_TEST_EXTENSION_ID`, `LOAD_TEST_VERSION_ID`, `LOAD_TEST_INSTALLATION_ID`, `LOAD_TEST_MIGRATION_INSTALLATION_ID`, and `LOAD_TEST_MIGRATION_VERSION_ID`; provide short-lived `LOAD_TEST_PUBLISHER_TOKEN`, `LOAD_TEST_OPERATOR_TOKEN`, and `LOAD_TEST_SCHOOL_ADMIN_TOKEN`. Publication also requires `LOAD_TEST_RELEASE_VERSION` and `load-test/fixtures/synthetic-extension.zip`.

The API phase driver accepts only approved non-production or loopback targets after `LOAD_TEST_AUTHORIZATION=I_ACKNOWLEDGE_NON_PRODUCTION_ONLY`, allows bounded HTTP methods/statuses/polls, prevents multipart path traversal, supports scalar response captures for later steps, and records response hashes without tokens or response bodies. The orchestrator accepts only allowlisted executables, never invokes a shell, bounds every timeout and output, restricts environment overrides to `LOAD_*`, rejects production targets, requires every workload/failure phase, runs lifecycle operations concurrently with traffic, and writes exclusive-create SHA-256 command evidence. Every injected failure has mandatory `inject`, `workload`, `recover`, and `verify` steps; recovery executes in `finally` even when workload fails. A manifest is execution configuration, not proof of a passing certification.

The `limits` phase runs concurrently with sustained traffic rather than afterward. `npm.cmd run load:limits -- <evidence-path>` samples the authenticated platform observability endpoint every ten seconds for the full two-hour profile. It records only hashes and aggregate maxima/minima, fails closed if database, Redis, R2, or any queue becomes unhealthy, and requires a positive database connection ceiling, configured Redis `maxmemory`, queue worker counts, queue age, and R2 operation error-rate telemetry. The resulting `limits` object maps directly to the certification verifier; do not substitute an idle or post-test snapshot.

All seven failure phases use immutable definitions in `load-test/chaos-scenarios/` and `npm.cmd run load:chaos -- <scenario> <inject|recover|verify> <evidence>`. Set `LOAD_CHAOS_CONTROL_URL` to an isolated performance-only chaos controller and `LOAD_CHAOS_CONTROL_SECRET` to a dedicated secret of at least 32 characters. The driver HMAC-signs timestamped, nonce-bound requests, rejects production/Railway hosts, constrains blast radius to synthetic schools, polls an identity-bound terminal state, hashes operation IDs and responses, and writes no secret or controller response body. The controller must implement `POST /v1/chaos/operations` returning `202 {"id":"..."}` and `GET /v1/chaos/operations/:id` returning the same `runId`, `scenario`, and `action` with `INJECTED`, `RECOVERED`, `VERIFIED`, or `FAILED`. Recovery remains mandatory in the orchestrator's `finally` path. These controls prepare execution but do not prove any failure test passed until a measured run produces evidence.

A deployable controller is included as `npm.cmd run load:chaos-controller`. Deploy it as a separate performance-only service, never as part of the application API. It requires `LOAD_CHAOS_CONTROLLER_AUTHORIZATION=I_AUTHORIZE_ISOLATED_CHAOS_CONTROL`, `LOAD_CHAOS_ENVIRONMENT=ISOLATED_PERFORMANCE`, a dedicated `LOAD_CHAOS_REDIS_URL` that is not `REDIS_URL`, `LOAD_TEST_AUTHORIZATION=I_ACKNOWLEDGE_NON_PRODUCTION_ONLY`, separate 32-character `LOAD_CHAOS_CONTROL_SECRET` and `LOAD_CHAOS_ADAPTER_SECRET`, and one `LOAD_CHAOS_ADAPTER_<SCENARIO>_URL` per scenario. It binds to `127.0.0.1:8787` unless explicitly configured. Redis persists operations and rejects nonce replay; requests older than 60 seconds fail. Each adapter must expose `POST /v1/chaos-adapter/actions`, verify the adapter HMAC, enforce the supplied synthetic blast radius, and return the same operation/run/scenario/action identity with the requested terminal state. Provider-specific credentials stay in adapters and never enter Wattaman or the controller.
