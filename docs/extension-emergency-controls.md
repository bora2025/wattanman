# Extension Emergency Controls

Platform administrators can immediately isolate extension behavior from the Extensions **Operations** view. Controls are stored in the platform control plane and every activation or deactivation requires a reason and creates an audit event.

## Kill-switch scopes

- `PUBLISHER`: blocks every extension owned by a publisher.
- `EXTENSION`: blocks one extension across all versions and schools.
- `VERSION`: blocks one installed release.
- `SCHOOL`: blocks extension runtime and activation for one tenant without suspending core school administration.
- `CAPABILITY`: blocks one declared `resource:read` or `resource:write` capability for one extension.

Controls fail closed during page/resource access, installation, upgrade, and activation. Deactivation, uninstall, purge, and operator recovery remain available so incidents can be contained. Blocked extensions are omitted from school navigation.

## Runtime circuit breaker

Each extension key has an independent distributed Redis circuit. HTTP 5xx runtime failures count toward the configured `CIRCUIT_BREAKER_FAILURE_THRESHOLD`; user and policy 4xx responses do not. An open circuit returns HTTP 503 before the extension controller executes, permits one recovery probe after `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`, and raises a critical `RUNTIME_CIRCUIT_OPEN` alert scoped to the school and extension.

## Incident workflow

1. Review the operational alert and affected scope.
2. Activate the narrowest safe kill switch and record the incident reference in the reason.
3. Confirm core login and administration remain available.
4. Diagnose package, release, capability, or tenant behavior.
5. Correct and validate the release in an internal or pilot wave.
6. Deactivate the switch with a recovery reason.
7. Monitor the circuit and resource alerts before advancing rollout.
