DROP TABLE IF EXISTS "SchoolAddon";
DROP TABLE IF EXISTS "AddonDefinition";

DROP INDEX IF EXISTS "Extension_legacyAddonKey_key";
ALTER TABLE "Extension" DROP COLUMN IF EXISTS "legacyAddonKey";
