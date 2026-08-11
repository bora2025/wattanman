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
