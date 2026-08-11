# Stage 3 Marketplace Hardening

## Catalog metadata contract

Extension catalog records use a controlled category taxonomy: academics,
administration, communication, finance, productivity, reporting, security,
student services, themes, or other. Tags are unique lowercase slugs (maximum
12), and locales are BCP-47-style identifiers (maximum 20, with at least one).

Support and privacy policy links must use HTTPS. The data-use disclosure records
whether personal data is collected, its controlled categories and purposes,
third-party sharing, and an optional retention period. Extensions that collect
personal data must declare at least one category and purpose. Extensions that do
not collect personal data cannot declare collection details.

Platform publisher managers edit metadata through the audited
`PATCH /platform/extensions/:extensionId/metadata` endpoint. School marketplace
details display category, tags, supported locales, support/privacy links, and the
data-use disclosure before a request is submitted.

## Validation evidence

- Unit tests cover normalization and rejected categories, tags, locales, URLs,
  and inconsistent privacy disclosures.
- The complete backend test suite and backend/frontend production builds pass.
- All 31 migrations apply to empty PostgreSQL 16 and Prisma reports no schema
  difference after application.
- Production API deployment `2b2627b2-d9b1-45ed-b2d2-8668d8afc8eb` and
  frontend deployment `530d4350-8813-4a25-87c3-24212b62e47e` completed
  successfully on 2026-08-11.

## Rollback guidance

Application rollback is safe because all new columns have database defaults and
older application versions ignore them. Do not drop metadata columns during an
incident rollback. Roll back application images first, retain the additive
schema, and roll forward after correction. Column removal requires a later
contract migration only after confirming no deployed version reads the fields
and after taking a verified backup.

## Publisher onboarding and verification

External publishers are created through an authenticated platform workflow with
a normalized key, display and legal names, contact email, HTTPS website, and ISO
country code. New publishers start `SUSPENDED` with verification status
`PENDING`; their initial publisher member receives upload, publish, and manage
roles but cannot verify the organization.

A different platform administrator must record an explicit `VERIFIED` or
`REJECTED` decision with notes. Verification activates the publisher; rejection
keeps it suspended. Publisher members cannot approve their own organization, a
revoked publisher cannot be verified, and an unverified external publisher
cannot be activated through the general status control. Every onboarding and
verification decision is written to the audit log.

The schema change is additive. During rollback, retain verification columns and
roll back application images only. Existing internal publishers are backfilled
as verified; external publishers remain fail-closed unless explicitly approved.

Production API deployment `42c88ae7-5dd7-4a2b-9933-8e552627677c` and frontend
deployment `26b4ed61-df9b-4c5f-bdb9-9052e0a06d51` completed successfully on
2026-08-11.

## Publisher member roles

Publisher managers can add an existing platform administrator by verified email,
assign any combination of `UPLOAD`, `REVIEW`, `PUBLISH`, and `MANAGE`, edit those
roles, and suspend or reactivate membership. Every change requires an active
publisher `MANAGE` role and is audited. The service refuses to remove the manage
role from, or suspend, the final active publisher manager so an organization
cannot be locked out accidentally.

Role and status changes are application-only and require no schema rollback. If
an application rollback is needed, existing member rows remain compatible; use
the audit history to restore the last known role set after rolling forward.

Production API deployment `e51cdb36-a165-4aba-962a-d6e00530196d` and frontend
deployment `67ae9a6c-c3f0-455d-9db5-51947bb91dd2` completed successfully on
2026-08-11.

## Signing-key lifecycle

The platform displays non-secret SHA-256 public-key fingerprints and marks the
key currently selected by `EXTENSION_SIGNING_KEY_ID`. Registration rejects both
duplicate IDs and duplicate public keys. Rotation creates a second active key so
the old key remains valid while operators update the private-key environment and
publish a signed test release. The configured key cannot be retired until the
environment points to its replacement. Retired keys remain valid for historical
package verification and can be reactivated; revoked keys cannot be restored and
immediately block affected releases and installations.

Safe rotation sequence:

1. Select **Rotate** on the active key and register the replacement public key.
2. Update `EXTENSION_SIGNING_KEY_ID` and
   `EXTENSION_SIGNING_PRIVATE_KEY_BASE64` in the deployment secret store.
3. Deploy and publish a test package; verify its checksum and signature.
4. Retire the previous key. Revoke only for compromise or emergency response.

No schema change is required. Rollback retains both active keys and restores the
previous environment pair. Never delete or revoke the previous key as part of a
normal application rollback.

Production API deployment `e11d5f09-03cf-40aa-ae82-bde057f49f57` and frontend
deployment `b6a06117-ca06-4184-9f5a-dc2276bc42e6` completed successfully on
2026-08-11.

## Marketplace discovery and collections

School discovery performs server-side search across name, key, description, and
tags, with category, runtime, commercial type, and locale filters. Stable opaque
cursors support featured, newest, name ascending, and name descending ordering;
cursors are bound to their sort mode and fail closed if reused incorrectly. The
school interface requests 24 records at a time and exposes **Load more** instead
of loading the full marketplace into memory.

Platform administrators can create locale-specific draft collections, order up
to 100 catalog extensions, publish a non-empty collection, and archive it. The
school API returns at most 20 published collections and 20 tenant-visible items
per collection. Private items remain subject to school grants, while inactive,
retired, unpublished, and unavailable extensions are excluded. Collection
changes are audited.

The migration is additive and defaults all existing extensions to the lowest
featured priority. Application rollback can retain the collection tables and
featured rank. Roll back application images first; do not drop collection data.
A later contract migration may remove these structures only after a verified
backup and after all deployed versions stop reading them.

Production API deployment `96eb4102-52da-46a6-8ec3-c0ae13005e78` and frontend
deployment `59216aae-772c-43ba-857f-da7b503c0ac1` completed successfully on
2026-08-11.

## School marketplace and management separation

The school marketplace is limited to discovery, extension details, privacy and
data-use disclosures, and initiating an installation request. Installed
lifecycle controls are deliberately excluded; installed results link operators
to the management page instead.

The school management page owns request, installation, billing, and activation
status, update-policy selection, pilot feedback, and permanent removal. This
keeps browsing safe and predictable while placing destructive and operational
actions in one auditable workflow. A source-level regression test prevents
management controls from being reintroduced into the marketplace route.

This change has no schema impact. Rollback requires only restoring the previous
frontend and backend application images.

Production API deployment `e3646496-9536-4536-afbe-3223e6cbcb0e` and frontend
deployment `ef0c16cd-4e96-4fa7-a0b7-34d31caa0769` completed successfully on
2026-08-11. Validation passed with 228 backend tests, one intentional skip, and
successful backend and frontend production builds.

## Validation report provenance

Each package validation persists report schema v1 and the exact pipeline,
isolated worker runner, package validator, manifest schema, Ajv, JSZip, ClamAV
engine, and ClamAV signature database versions used for the decision. Structured
errors and warnings remain immutable report evidence, while platform release
details display both the report and tool provenance for operator review.

ClamAV version data comes from the daemon's framed `VERSION` command and is
cached for five minutes; extension-worker startup validates both version and
scan commands. The pipeline records provenance atomically with final validation
status and release lifecycle state, preventing a passed or rejected decision
from being detached from its evidence.

The migration is additive: existing reports retain null tool provenance and are
displayed as unavailable, while all new reports use schema v1. Rollback restores
the previous application images and leaves the added JSON provenance and schema
version columns intact.

The complete 34-migration chain replayed from empty PostgreSQL with no Prisma
schema drift. Production API deployment `04cba07a-a472-4fa6-868d-ef8d6321489e`,
frontend deployment `9ea185cc-cf32-4b4c-8b5f-6ccc5b5d79f6`, and extension-worker
deployment `12d5eee6-efa7-4e10-aa61-416fddf0baec` completed successfully on
2026-08-11. Validation passed with 249 backend tests, one intentional skip, and
successful backend and frontend production builds.

## Versioned manifest JSON Schema

Theme and declarative-module manifest v1 contracts are executable JSON Schema
draft 2020-12 documents bundled into every API and extension-worker image. Ajv
compiles them in strict, all-errors mode at validator construction. The package
pipeline reports each violation as `MANIFEST_JSON_SCHEMA` with its manifest path,
schema keyword, and diagnostic before applying existing semantic checks such as
extension identity, expected release version, references, dependencies,
conflicts, and migration operations.

Both schemas reject unknown properties except explicitly namespaced `x-`
metadata. They constrain required fields, primitive types, patterns, enums,
uniqueness, collection sizes, nested object shapes, and manifest schema version.
Build tests verify that both `*-v1.schema.json` assets are copied into production
output so isolated validation workers never depend on repository documentation
or network access.

Rollback restores the previous validator image while retaining v1 manifests and
reports. Schema files are additive immutable contracts; changes to accepted v1
behavior require a compatibility review, while incompatible changes require a
new schema version.

Production API deployment `b24c0a87-ea49-4537-91d8-417e8e9358c8` and
extension-worker deployment `4c67e994-e33c-4175-9c3c-215a5a0deaa1` completed
successfully on 2026-08-11. Validation passed with 248 backend tests, one
intentional skip, and successful backend and frontend production builds.

## Malicious archive boundaries

Archive metadata is evaluated before any entry is extracted. Validation permits
at most 200 files and 250 total entries, 5MB per expanded file, 10MB aggregate
expanded data, eight path segments, 240 path characters, 100 characters per
segment, and a 100:1 compression ratio. Invalid or negative ZIP size metadata,
zero-byte compressed representations of non-empty files, and any exceeded bound
stop extraction entirely.

Paths are Unicode-normalized and reject absolute, drive-qualified, traversal,
empty, control-character, overlong, and case-insensitive duplicate names.
Symbolic links, executable/source extensions, unsupported extensions, and MIME
signature mismatches are rejected. Approved JSON files must also parse as JSON.
The malicious-package suite covers compression bombs, oversized aggregate data,
entry floods, traversal, symlinks, and disguised content.

Rollback restores the prior validator image but retains all rejected validation
reports and quarantined objects. Operators must not retry packages rejected by a
new safety boundary against an older validator.

Production API deployment `0c14f8a8-4b13-40ee-8bdb-1e93295ef0f0` and
extension-worker deployment `2de93e14-eba7-4f23-865b-87c54c7e6b27` completed
successfully on 2026-08-11. Validation passed with 244 backend tests, one
intentional skip, and successful backend and frontend production builds.

## Immutable checksum-addressed package storage

Quarantined ZIPs, extracted validated assets, and published ZIPs are keyed by
their SHA-256 content identity. Every immutable write signs and sends
`If-None-Match: *`, which Cloudflare R2 supports for conditional `PutObject`
operations. A `412 PreconditionFailed` is treated as an idempotent retry only
after downloading the existing private object and confirming exact length and
SHA-256 identity. Any key/body mismatch or collision fails closed before package
state advances. See the official [Cloudflare R2 S3 compatibility
reference](https://developers.cloudflare.com/r2/api/s3/api/).

Mutable platform assets continue using the separate mutable storage method, so
the no-overwrite guarantee is explicit at each package call site. Rollback must
retain existing checksum-addressed objects; restoring the previous application
image does not require copying or renaming R2 data.

Production API deployment `066ff4e0-86c8-4b28-ae6b-08dca4e472ca` and
extension-worker deployment `28b04468-a62f-4976-b973-0c26c7abe0ca` completed
successfully on 2026-08-11. Validation passed with 235 backend tests, one
intentional skip, and successful backend and frontend production builds.

## Antivirus scanning

Before ZIP parsing, the extension worker streams quarantined bytes to a
dedicated ClamAV 1.4 service with the framed `INSTREAM` protocol. The scanner is
reachable only through Railway private networking on port 3310. Clean results
continue to structural validation; detected signatures produce a persisted
`MALWARE_DETECTED` validation failure and reject the version without extracting
assets. Timeouts, connection failures, oversized responses, and malformed
responses fail closed and remain retryable through BullMQ.

The extension worker performs a real empty-stream scan during startup, so it
cannot become ready while ClamAV is unavailable. The client bounds scan time,
response size, and stream chunk size. The protocol and deployment follow the
official [ClamD protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
and [ClamAV Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html).

Rollback first pauses package upload processing, scales the extension worker to
zero, restores the previous worker/API images, and retains rejected quarantine
objects and validation reports. The private scanner can then be removed only
after no deployed worker references it.

Production API deployment `61857840-3eca-4ad5-9205-d25064311c8b`,
extension-worker deployment `11aac888-8f98-45ab-a756-cd2f48a082f6`, and ClamAV
deployment `3ee08ffa-632d-4c7b-89c5-6ab10fed4cbd` completed successfully on
2026-08-11. Validation passed with 239 backend tests, one intentional skip, and
successful backend and frontend production builds.

## Asynchronous package completion

The upload endpoint performs only bounded request-path work: it validates the
multipart envelope, computes SHA-256, writes the ZIP to quarantine, persists a
deterministic `PENDING` validation, and returns HTTP `202` after enqueueing a
checksum-bound BullMQ job. Repeating the request with the same version and bytes
reuses both validation identity and queue idempotency key, including recovery
after a transient enqueue failure.

The dedicated extension worker downloads the private object, verifies its
checksum before parsing, writes checksum-addressed validated assets with
idempotent upserts, and atomically records the validation report and final
version state. Completed jobs are safe to replay. Infrastructure failures remain
retryable and flow to the existing extension dead-letter queue after exhaustion.
The platform UI polls while a package is quarantined or validating.

Rollback requires scaling the extension worker to zero before restoring the
previous API image so old synchronous requests cannot race new queued work. No
schema rollback is required.

Production API deployment `99093b1a-7f6a-4041-90ae-2c88be5db0b7`, frontend
deployment `05efe9ac-f515-4fb0-960a-a997742feb93`, and extension-worker
deployment `9cb376f3-0312-4f2a-b327-3d616b0816d6` completed successfully on
2026-08-11. Validation passed with 231 backend tests, one intentional skip, and
successful backend and frontend production builds.

## Approved immutable package signing

Publication signing is a separate cryptographic boundary, not an assumption
derived from the caller. It accepts only an `APPROVED` release that has no prior
signature and whose package key exactly matches
`quarantine/extensions/{extensionId}/{versionId}/{sha256}.zip`. The signer reads
that immutable object, recomputes SHA-256, requires the configured publisher key
to remain active, signs the bytes with Ed25519, and verifies the new signature
against the registered public key before returning values for persistence.

Retries cannot replace or re-sign an approved artifact. Rollback retains the
checksum-addressed object, signature, signing-key reference, and registered
public key so previously published releases remain independently verifiable.
Revocation is evaluated separately when a package is installed or used.

Production API deployment `8b477c13-c261-4f74-93f4-762e1c64f816` completed
successfully on 2026-08-11. Validation passed with 250 backend tests, one
intentional skip, and successful backend and frontend production builds.

## Install and runtime signature verification

Every non-core install, upgrade, rollback, and activation reads the immutable
published ZIP and verifies its checksum and Ed25519 signature against the
version's registered signing key. Declarative runtime navigation, page, and data
operations apply the same fail-closed boundary before consuming a manifest.
Verification additionally requires a `PUBLISHED` or rollback-eligible
`DEPRECATED` lifecycle and the exact
`published/extensions/{extensionId}/{versionId}/{sha256}.zip` object key.

Successful runtime verification may be cached for five minutes using the full
version, checksum, signature, key identity, and key-status tuple. Lifecycle and
revocation are checked before each cache hit, so changing either immediately
bypasses the cache and fails closed. The cache is process-local and bounded to
1,000 identities; it contains no package bytes or private keys.

Production API deployment `76905dd2-5fcb-4004-a6bc-c4a0c9c2c1e5` completed
successfully on 2026-08-11. Validation passed with 252 backend tests, one
intentional skip, and successful backend and frontend production builds.
