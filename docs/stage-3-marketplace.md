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

## Rollback guidance

Application rollback is safe because all new columns have database defaults and
older application versions ignore them. Do not drop metadata columns during an
incident rollback. Roll back application images first, retain the additive
schema, and roll forward after correction. Column removal requires a later
contract migration only after confirming no deployed version reads the fields
and after taking a verified backup.
