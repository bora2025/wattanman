CREATE TABLE "ExtensionPaymentEvidence" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "storageKey" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "legalHoldReason" TEXT,
    "legalHoldAt" TIMESTAMP(3),
    "legalHoldBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionPaymentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionPaymentEvidence_storageKey_key" ON "ExtensionPaymentEvidence"("storageKey");
CREATE INDEX "ExtensionPaymentEvidence_schoolId_createdAt_idx" ON "ExtensionPaymentEvidence"("schoolId", "createdAt");
CREATE INDEX "ExtensionPaymentEvidence_installationId_createdAt_idx" ON "ExtensionPaymentEvidence"("installationId", "createdAt");
CREATE INDEX "ExtensionPaymentEvidence_status_legalHold_retainUntil_idx" ON "ExtensionPaymentEvidence"("status", "legalHold", "retainUntil");

ALTER TABLE "ExtensionPaymentEvidence"
ADD CONSTRAINT "ExtensionPaymentEvidence_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtensionPaymentEvidence"
ADD CONSTRAINT "ExtensionPaymentEvidence_installationId_fkey"
FOREIGN KEY ("installationId") REFERENCES "ExtensionInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ExtensionPaymentEvidence" (
    "id", "schoolId", "installationId", "storageKey", "fileName", "contentType", "size", "checksum",
    "status", "uploadedAt", "submittedAt", "retainUntil", "createdBy", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || md5("id" || COALESCE("invoiceStorageKey", '')),
    "schoolId",
    "id",
    "invoiceStorageKey",
    COALESCE("invoiceFileName", 'payment-evidence'),
    COALESCE("invoiceContentType", 'application/octet-stream'),
    COALESCE("invoiceSize", 0),
    COALESCE("invoiceChecksum", repeat('0', 64)),
    CASE WHEN "paymentSubmittedAt" IS NULL THEN 'PENDING' ELSE 'SUBMITTED' END,
    "invoiceUploadedAt",
    "paymentSubmittedAt",
    COALESCE("paymentSubmittedAt", "createdAt") + INTERVAL '2555 days',
    "requestedBy",
    "createdAt",
    "updatedAt"
FROM "ExtensionInstallation"
WHERE "invoiceStorageKey" IS NOT NULL;

CREATE POLICY tenant_school_isolation ON "ExtensionPaymentEvidence" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
