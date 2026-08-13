# Cloudflare R2 incident runbook

**Owner:** Infrastructure Owner. **Page:** `DEPENDENCY_HEALTH:R2`.

## Triage

1. Record the alert ID, bucket, operation class, HTTP status, latency, deployment ID, and correlation ID. Never record access keys, signed URLs, payment evidence, package bytes, or report bodies.
2. Check Cloudflare status, R2 metrics, token permissions, bucket existence, endpoint/account configuration, and recent credential or lifecycle changes.
3. Determine affected prefixes: quarantine/validated extension packages, school billing evidence, backups, extension purge reports, or school deletion reports.

## Containment

1. Disable new package uploads, payment evidence submissions, backup exports, restore execution, and destructive purge/deletion workflows when object verification is unavailable.
2. Keep existing metadata and pending states. Storage-first deletion semantics intentionally retry; do not null storage keys or mark objects purged manually.
3. For credential compromise, create a least-privilege replacement token, update API and workers, verify health, then revoke the old token. Do not make the bucket public.
4. Preserve immutable checksum-addressed objects and Cloudflare audit evidence.

## Recovery

1. Restore private endpoint access and verify authenticated HEAD, PUT, GET, LIST, and DELETE using a disposable incident prefix; delete and relist it afterward.
2. Run R2 storage tests, resume one worker, and retry pending reports/exports before accepting new writes.
3. Validate representative stored-object SHA-256 values against database metadata. For missing objects, identify the authoritative source; never fabricate an object to satisfy metadata.
4. Resume uploads first, then exports, then destructive workflows. Monitor dependency health and pending object-backed records for 30 minutes.

## Verification and closure

The bucket remains private, health is green, disposable-prefix cleanup is verified, pending operations converge, and no signed URL exceeds 15 minutes. Record affected object keys only as bounded prefixes/checksums, data-loss findings, rotations, measured RTO, and corrective owners.
