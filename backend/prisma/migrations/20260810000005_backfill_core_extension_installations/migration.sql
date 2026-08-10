INSERT INTO "ExtensionInstallation" (
  "id",
  "schoolId",
  "extensionId",
  "installedVersionId",
  "enabled",
  "billingStatus",
  "requestedAt",
  "approvedAt",
  "installedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'extinst_' || md5(sa."schoolId" || ':' || extension."id"),
  sa."schoolId",
  extension."id",
  version."id",
  sa."enabled",
  CASE WHEN sa."enabled" THEN 'ACTIVE' ELSE sa."billingStatus" END,
  COALESCE(sa."requestedAt", sa."createdAt"),
  CASE WHEN sa."enabled" THEN COALESCE(sa."activatedAt", sa."updatedAt") ELSE NULL END,
  CASE WHEN sa."enabled" THEN COALESCE(sa."activatedAt", sa."updatedAt") ELSE NULL END,
  sa."createdAt",
  sa."updatedAt"
FROM "SchoolAddon" sa
JOIN "Extension" extension ON extension."key" = sa."addonKey"
JOIN LATERAL (
  SELECT version."id"
  FROM "ExtensionVersion" version
  WHERE version."extensionId" = extension."id"
    AND version."lifecycleStatus" IN ('PUBLISHED', 'DEPRECATED')
  ORDER BY version."publishedAt" DESC NULLS LAST, version."createdAt" DESC
  LIMIT 1
) version ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "ExtensionInstallation" installation
  WHERE installation."schoolId" = sa."schoolId"
    AND installation."extensionId" = extension."id"
);

DELETE FROM "SchoolAddon"
WHERE "addonKey" IN (
  SELECT "key" FROM "Extension" WHERE "commercialType" = 'MODULE'
);

DELETE FROM "AddonDefinition"
WHERE "kind" = 'MODULE';
