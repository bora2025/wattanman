ALTER TABLE "Extension"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "locales" TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  ADD COLUMN "supportUrl" TEXT,
  ADD COLUMN "privacyPolicyUrl" TEXT,
  ADD COLUMN "dataUse" JSONB NOT NULL DEFAULT '{"collectsPersonalData":false,"dataCategories":[],"purposes":[],"sharesWithThirdParties":false,"retentionDays":null}'::JSONB;

UPDATE "Extension" SET "category" = 'OTHER' WHERE "category" IS NULL OR BTRIM("category") = '';

ALTER TABLE "Extension"
  ALTER COLUMN "category" SET DEFAULT 'OTHER',
  ALTER COLUMN "category" SET NOT NULL;

CREATE INDEX "Extension_category_status_idx" ON "Extension"("category", "status");
