ALTER TABLE "ExtensionInstallation"
ADD COLUMN "lifecycleState" TEXT NOT NULL DEFAULT 'REQUESTED';

UPDATE "ExtensionInstallation"
SET "lifecycleState" = CASE
  WHEN "uninstalledAt" IS NOT NULL THEN 'UNINSTALLED'
  WHEN "enabled" = TRUE THEN 'ACTIVE'
  WHEN "installedAt" IS NOT NULL THEN 'INSTALLED'
  WHEN "approvedAt" IS NOT NULL THEN 'APPROVED'
  WHEN "paymentSubmittedAt" IS NOT NULL THEN 'PAYMENT_REVIEW'
  ELSE 'REQUESTED'
END;

ALTER TABLE "ExtensionInstallation"
ADD CONSTRAINT "ExtensionInstallation_lifecycle_state_check"
CHECK ("lifecycleState" IN ('REQUESTED', 'PAYMENT_REVIEW', 'APPROVED', 'INSTALLED', 'ACTIVE', 'UNINSTALLED'));

CREATE INDEX "ExtensionInstallation_schoolId_lifecycleState_updatedAt_idx"
ON "ExtensionInstallation"("schoolId", "lifecycleState", "updatedAt");
