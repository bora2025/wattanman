ALTER TABLE "SchoolDomain"
ADD COLUMN "routingStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "routingCheckedAt" TIMESTAMP(3),
ADD COLUMN "routingError" TEXT;

UPDATE "SchoolDomain"
SET
  "routingStatus" = CASE
    WHEN "type" = 'LEGACY_ALIAS' THEN 'PENDING'
    ELSE 'READY'
  END,
  "routingCheckedAt" = CASE
    WHEN "type" = 'LEGACY_ALIAS' THEN NULL
    ELSE CURRENT_TIMESTAMP
  END;
