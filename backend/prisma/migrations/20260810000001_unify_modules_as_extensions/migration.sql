INSERT INTO "ExtensionPublisher" ("id", "key", "name", "status", "internal", "createdAt", "updatedAt")
VALUES ('publisher_wattaman_core', 'WATTAMAN', 'Wattaman', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Extension" (
  "id", "key", "name", "description", "runtimeType", "commercialType", "category",
  "publisher", "publisherId", "status", "isListed", "visibility", "legacyAddonKey", "createdAt", "updatedAt"
)
SELECT
  'core_' || md5(definition."key"),
  definition."key",
  definition."name",
  definition."description",
  CASE WHEN definition."kind" = 'THEME' THEN 'THEME' ELSE 'CORE_MODULE' END,
  definition."kind",
  definition."category",
  'WATTAMAN',
  publisher."id",
  CASE WHEN definition."isActive" THEN 'ACTIVE' ELSE 'RETIRED' END,
  definition."isActive",
  CASE WHEN definition."isActive" THEN 'LISTED' ELSE 'UNLISTED' END,
  definition."key",
  definition."createdAt",
  CURRENT_TIMESTAMP
FROM "AddonDefinition" definition
JOIN "ExtensionPublisher" publisher ON publisher."key" = 'WATTAMAN'
ON CONFLICT ("key") DO UPDATE SET
  "legacyAddonKey" = EXCLUDED."legacyAddonKey",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ExtensionVersion" (
  "id", "extensionId", "version", "manifestSchema", "manifest", "compatibilityRange",
  "lifecycleStatus", "releaseNotes", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  'corev_' || md5(extension."id" || ':1.0.0'),
  extension."id",
  '1.0.0',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'key', extension."key",
    'name', extension."name",
    'version', '1.0.0',
    'runtimeType', extension."runtimeType",
    'core', true
  ),
  '>=1.0.0 <2.0.0',
  CASE WHEN extension."status" = 'ACTIVE' THEN 'PUBLISHED' ELSE 'RETIRED' END,
  'Migrated from the legacy module catalog.',
  CASE WHEN extension."status" = 'ACTIVE' THEN extension."createdAt" ELSE NULL END,
  extension."createdAt",
  CURRENT_TIMESTAMP
FROM "Extension" extension
WHERE extension."legacyAddonKey" IS NOT NULL
ON CONFLICT ("extensionId", "version") DO NOTHING;

INSERT INTO "ExtensionInstallation" (
  "id", "schoolId", "extensionId", "installedVersionId", "enabled", "billingStatus",
  "requestedBy", "requestedAt", "approvedBy", "approvedAt", "installedBy", "installedAt",
  "createdAt", "updatedAt"
)
SELECT
  'corei_' || md5(legacy."schoolId" || ':' || extension."id"),
  legacy."schoolId",
  extension."id",
  version."id",
  legacy."enabled",
  legacy."billingStatus",
  legacy."requestedBy",
  legacy."requestedAt",
  legacy."activatedBy",
  legacy."activatedAt",
  legacy."activatedBy",
  COALESCE(legacy."activatedAt", legacy."createdAt"),
  legacy."createdAt",
  CURRENT_TIMESTAMP
FROM "SchoolAddon" legacy
JOIN "Extension" extension ON extension."key" = legacy."addonKey"
JOIN "ExtensionVersion" version ON version."extensionId" = extension."id" AND version."version" = '1.0.0'
ON CONFLICT ("schoolId", "extensionId") DO UPDATE SET
  "enabled" = EXCLUDED."enabled",
  "billingStatus" = EXCLUDED."billingStatus",
  "updatedAt" = CURRENT_TIMESTAMP;
