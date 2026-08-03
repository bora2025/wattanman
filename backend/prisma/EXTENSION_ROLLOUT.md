# Extension Platform Foundation Rollout

This rollout is additive. The existing `AddonDefinition` and `SchoolAddon` paths remain active while versioned extensions are introduced.

## Prerequisites

1. Back up PostgreSQL.
2. Create a private Cloudflare R2 bucket.
3. Configure `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
4. Confirm the R2 credentials can write only to the extension bucket.

## Deploy order

1. For a pre-existing schema without migration history, back it up and run `npm run db:migrate:adopt`; the command refuses adoption when Prisma detects drift.
2. Run `npm run db:migrate:bootstrap` to deploy all pending migrations, including `20260803000001_add_extension_platform_foundation`.
3. Deploy backend and frontend application code.
4. Run `npm run db:backfill-extensions` from `backend/` once.
5. Run it a second time and confirm counts remain stable; the backfill is idempotent.
6. Run `npm run db:verify-extension-backfill`; it must return `"valid": true` and zero errors.
7. Archive the verifier JSON with the deployment evidence. It checks every catalog key/type/state and every school installation's enabled/billing state, not only aggregate counts.
8. Test package upload, validation, review, publication, request, approval, installation, and activation on a non-production school.

## Verification queries

```sql
SELECT COUNT(*) FROM "AddonDefinition";
SELECT COUNT(*) FROM "Extension" WHERE "legacyAddonKey" IS NOT NULL;

SELECT COUNT(*) FROM "SchoolAddon" WHERE "enabled" = true;
SELECT COUNT(*) FROM "ExtensionInstallation" WHERE "enabled" = true;

SELECT ad."key"
FROM "AddonDefinition" ad
LEFT JOIN "Extension" e ON e."legacyAddonKey" = ad."key"
WHERE e."id" IS NULL;
```

The final query must return zero rows. `npm run db:verify-extension-backfill` is authoritative because it additionally checks key identity, runtime/commercial mapping, active/listed state, and every school row's enabled and billing values. Investigate any verifier error before enabling new extension UI in production.

## Rollback

Application rollback does not require dropping the new tables because legacy reads and writes remain unchanged. Roll back the application deployment and leave the additive tables in place.

If the foundation must be removed after data export and confirmation that no new-only extension has been created:

1. Disable extension upload routes at the deployment layer.
2. Export all `Extension*` tables.
3. Drop foreign keys and tables in reverse dependency order: `ExtensionInstallation`, `ExtensionValidation`, `ExtensionPermission`, `ExtensionAsset`, `ExtensionDependency`, `ExtensionVersion`, `Extension`.
4. Redeploy the legacy application.

Never drop the extension tables merely to roll back application code; preserving them is safer and avoids destroying uploaded package history.
