ALTER TABLE "ExtensionInstallation" ADD COLUMN "updatePolicy" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ExtensionInstallation" ADD COLUMN "availableVersionId" TEXT;
ALTER TABLE "ExtensionInstallation" ADD COLUMN "updateNotifiedAt" TIMESTAMP(3);

CREATE INDEX "ExtensionInstallation_updatePolicy_availableVersionId_idx"
ON "ExtensionInstallation"("updatePolicy", "availableVersionId");
