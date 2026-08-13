ALTER TABLE "ExtensionPurgeReport"
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "reportPayload" JSONB,
ADD COLUMN "reportSignature" TEXT,
ADD COLUMN "deliveryError" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3);

CREATE INDEX "ExtensionPurgeReport_deliveryStatus_createdAt_idx"
ON "ExtensionPurgeReport"("deliveryStatus", "createdAt");
