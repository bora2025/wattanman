ALTER TABLE "School"
ADD COLUMN "extensionDataBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extensionDataRecords" INTEGER NOT NULL DEFAULT 0;

UPDATE "School" s
SET
  "extensionDataBytes" = usage.bytes,
  "extensionDataRecords" = usage.records
FROM (
  SELECT
    "schoolId",
    COALESCE(SUM("byteSize"), 0)::INTEGER AS bytes,
    COUNT(*)::INTEGER AS records
  FROM "ExtensionRecord"
  GROUP BY "schoolId"
) usage
WHERE usage."schoolId" = s.id;

ALTER TABLE "School"
ADD CONSTRAINT "School_extensionDataBytes_nonnegative" CHECK ("extensionDataBytes" >= 0),
ADD CONSTRAINT "School_extensionDataRecords_nonnegative" CHECK ("extensionDataRecords" >= 0);

ALTER TABLE "ExtensionInstallation"
ADD CONSTRAINT "ExtensionInstallation_dataBytes_nonnegative" CHECK ("dataBytes" >= 0),
ADD CONSTRAINT "ExtensionInstallation_dataRecords_nonnegative" CHECK ("dataRecords" >= 0);
