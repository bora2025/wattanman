ALTER TABLE "Extension" ADD COLUMN "price" DOUBLE PRECISION;
ALTER TABLE "Extension" ADD COLUMN "priceNote" TEXT;

UPDATE "Extension" AS extension
SET
  "price" = addon."price",
  "priceNote" = addon."priceNote"
FROM "AddonDefinition" AS addon
WHERE extension."legacyAddonKey" = addon."key"
  AND addon."price" IS NOT NULL;
