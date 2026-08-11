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
