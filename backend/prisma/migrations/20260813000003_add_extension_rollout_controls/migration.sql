ALTER TABLE "ExtensionVersion"
ADD COLUMN "rolloutStage" TEXT NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN "rolloutPausedAt" TIMESTAMP(3),
ADD COLUMN "rolloutPauseReason" TEXT;

ALTER TABLE "ExtensionInstallation" ADD COLUMN "rolloutGroup" TEXT NOT NULL DEFAULT 'GENERAL';

UPDATE "ExtensionInstallation"
SET "updatePolicy" = CASE
  WHEN "updatePolicy" = 'NOTIFY' THEN 'NOTIFY_ADMINS'
  WHEN "updatePolicy" = 'AUTO_APPROVED' THEN 'AUTOMATIC'
  ELSE "updatePolicy"
END;

CREATE INDEX "ExtensionVersion_rolloutStage_rolloutPausedAt_idx"
ON "ExtensionVersion"("rolloutStage", "rolloutPausedAt");

CREATE INDEX "ExtensionInstallation_rolloutGroup_updatePolicy_idx"
ON "ExtensionInstallation"("rolloutGroup", "updatePolicy");

ALTER TABLE "ExtensionMigrationRun"
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "interventionAt" TIMESTAMP(3),
ADD COLUMN "interventionBy" TEXT;

UPDATE "ExtensionMigrationRun" SET "completedAt" = "createdAt" WHERE "status" IN ('APPLIED', 'ROLLED_BACK');

ALTER TABLE "ExtensionMigrationBackup"
ADD COLUMN "versionId" TEXT,
ADD COLUMN "schemaVersion" INTEGER,
ADD COLUMN "concurrencyVersion" INTEGER;

UPDATE "ExtensionMigrationBackup" backup
SET "versionId" = run."fromVersionId",
    "schemaVersion" = COALESCE(version."manifestSchema", 1),
    "concurrencyVersion" = COALESCE((SELECT record."concurrencyVersion" FROM "ExtensionRecord" record WHERE record."id" = backup."recordId"), 1)
FROM "ExtensionMigrationRun" run
LEFT JOIN "ExtensionVersion" version ON version."id" = run."fromVersionId"
WHERE run."id" = backup."migrationRunId";

ALTER TABLE "ExtensionMigrationBackup" ALTER COLUMN "versionId" SET NOT NULL;
ALTER TABLE "ExtensionMigrationBackup" ALTER COLUMN "schemaVersion" SET NOT NULL;
ALTER TABLE "ExtensionMigrationBackup" ALTER COLUMN "concurrencyVersion" SET NOT NULL;
