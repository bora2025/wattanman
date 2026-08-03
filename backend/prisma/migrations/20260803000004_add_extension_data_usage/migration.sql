ALTER TABLE "ExtensionInstallation" ADD COLUMN "dataBytes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExtensionRecord" ADD COLUMN "byteSize" INTEGER NOT NULL DEFAULT 0;

UPDATE "ExtensionRecord"
SET "byteSize" = octet_length("data"::text);

UPDATE "ExtensionInstallation" installation
SET "dataBytes" = usage.bytes
FROM (
    SELECT "schoolId", "extensionId", COALESCE(SUM("byteSize"), 0)::INTEGER AS bytes
    FROM "ExtensionRecord"
    GROUP BY "schoolId", "extensionId"
) usage
WHERE installation."schoolId" = usage."schoolId"
  AND installation."extensionId" = usage."extensionId";

CREATE INDEX "ExtensionRecord_schoolId_byteSize_idx" ON "ExtensionRecord"("schoolId", "byteSize");
