ALTER TABLE "ExtensionPublisher"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "verificationNotes" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedBy" TEXT;

UPDATE "ExtensionPublisher"
SET "verificationStatus" = 'VERIFIED',
    "verifiedAt" = COALESCE("updatedAt", "createdAt"),
    "verificationNotes" = 'Existing publisher verified during marketplace migration'
WHERE "internal" = TRUE;

CREATE INDEX "ExtensionPublisher_verificationStatus_createdAt_idx"
  ON "ExtensionPublisher"("verificationStatus", "createdAt");
