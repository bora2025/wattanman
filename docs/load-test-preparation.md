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

## Production guard

The script requires `LOAD_TEST_AUTHORIZATION=I_ACKNOWLEDGE_NON_PRODUCTION_ONLY`, a target hostname containing `loadtest`, `performance`, `perf`, or `staging` (or localhost), a healthy preflight, and a target that does not identify itself as production. It always rejects `wattaman.app` and Railway public domains. Use a dedicated isolated performance environment and database; never weaken the guard to test production.

## Cost evidence

Set the approved environment-hour, request, and transfer rates. `handleSummary` writes request/byte/duration totals, input rates, and estimated USD cost to `results/<run-id>-cost.json`. Attach that report with infrastructure metrics and provider invoices to the capacity review; estimates do not replace invoices.

## Certification evidence

Populate a copy of `load-test/certification-evidence.example.json` only from measured non-production outputs, then run `npm.cmd run load:verify -- <path>`. The verifier fails unless all Stage 6 scale, sustained/burst, concurrent-session, traffic-operation, dependency-limit, failure-injection, tenant-isolation, automatic-recovery, autoscaling, cost-approval, and next-threshold requirements are present and within approved limits. A passing checksum is evidence integrity, not a substitute for attached source metrics.

## Orchestration

Copy `load-test/certification-manifest.example.json`, replace every explicit driver placeholder, and add all seven failure phases. Run `npm.cmd run load:run -- <manifest>`. The runner accepts only allowlisted executables, never invokes a shell, bounds every timeout and output, restricts environment overrides to `LOAD_*`, rejects production targets, requires every workload/failure phase, runs lifecycle operations concurrently with traffic, and writes exclusive-create SHA-256 command evidence. Every injected failure has mandatory `inject`, `workload`, `recover`, and `verify` steps; recovery executes in `finally` even when workload fails. A manifest is execution configuration, not proof of a passing certification.
