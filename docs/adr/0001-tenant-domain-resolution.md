# ADR 0001: Exact Tenant Domain Resolution

- Status: Accepted
- Date: 2026-08-10

## Context

Wattaman must route requests for at least 1,000 schools without guessing tenant identity. Parsing the first hostname label or falling back to the only school becomes unsafe as soon as multiple tenants exist.

## Decision

The API resolves a normalized request hostname through an exact `SchoolDomain.hostname` lookup. Only verified domains with ready routing may establish school scope. Managed subdomains, custom domains, platform domains, and legacy aliases are explicit records. Domain changes invalidate the bounded in-process cache.

Proxy-provided host headers are accepted only when proxy trust is configured. Authentication must additionally prove that the JWT `schoolId` equals the resolved school. Platform endpoints use a separate platform scope and never inherit a school from hostname guessing.

The temporary single-school fallback is a deployment migration flag only. Production must set `ALLOW_SINGLE_SCHOOL_HOST_FALLBACK=false` after domain backfill verification.

## Consequences

- Unknown, unverified, or unrouted domains fail closed.
- Domain provisioning and verification are durable control-plane operations.
- Cache keys never contain shared tenant data without hostname identity.
- Every production environment needs correct proxy-hop and tenant-header settings.
- Cross-domain JWT tests are mandatory before multi-school launch.

## Rollback

Rollback may restore the previous application release, but must not re-enable hostname guessing in a multi-school environment. Operators can create a verified legacy alias record when temporary compatibility is required.
