ALTER TABLE "ExtensionInstallation" ADD COLUMN "dataRecords" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ExtensionRecord"
ADD COLUMN "installationId" TEXT,
ADD COLUMN "versionId" TEXT,
ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "concurrencyVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "ExtensionRecord" record
SET "installationId" = installation."id",
    "versionId" = installation."installedVersionId"
FROM "ExtensionInstallation" installation
WHERE installation."schoolId" = record."schoolId"
  AND installation."extensionId" = record."extensionId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ExtensionRecord" WHERE "installationId" IS NULL OR "versionId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill extension record installation/version ownership';
  END IF;
END $$;

ALTER TABLE "ExtensionRecord" ALTER COLUMN "installationId" SET NOT NULL;
ALTER TABLE "ExtensionRecord" ALTER COLUMN "versionId" SET NOT NULL;

UPDATE "ExtensionInstallation" installation
SET "dataRecords" = counts.total
FROM (
  SELECT "installationId", COUNT(*)::INTEGER AS total
  FROM "ExtensionRecord"
  GROUP BY "installationId"
) counts
WHERE installation."id" = counts."installationId";

CREATE INDEX "ExtensionRecord_installationId_resource_createdAt_idx" ON "ExtensionRecord"("installationId", "resource", "createdAt");
CREATE INDEX "ExtensionRecord_versionId_idx" ON "ExtensionRecord"("versionId");

ALTER TABLE "ExtensionRecord" ADD CONSTRAINT "ExtensionRecord_installationId_fkey"
FOREIGN KEY ("installationId") REFERENCES "ExtensionInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionRecord" ADD CONSTRAINT "ExtensionRecord_versionId_fkey"
FOREIGN KEY ("versionId") REFERENCES "ExtensionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
