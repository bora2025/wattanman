ALTER TABLE "ExtensionValidation"
  ADD COLUMN "toolVersions" JSONB,
  ADD COLUMN "reportSchema" INTEGER NOT NULL DEFAULT 1;
