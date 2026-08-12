CREATE TABLE "ExtensionPurgeReport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "extensionId" TEXT,
    "installationId" TEXT,
    "scope" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "purgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageKey" TEXT NOT NULL,
    "reportKeyId" TEXT NOT NULL,
    "reportChecksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionPurgeReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionPurgeReport_storageKey_key" ON "ExtensionPurgeReport"("storageKey");
CREATE INDEX "ExtensionPurgeReport_schoolId_purgedAt_idx" ON "ExtensionPurgeReport"("schoolId", "purgedAt");
CREATE INDEX "ExtensionPurgeReport_extensionId_purgedAt_idx" ON "ExtensionPurgeReport"("extensionId", "purgedAt");
CREATE INDEX "ExtensionPurgeReport_installationId_purgedAt_idx" ON "ExtensionPurgeReport"("installationId", "purgedAt");

ALTER TABLE "ExtensionPurgeReport"
ADD CONSTRAINT "ExtensionPurgeReport_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE POLICY tenant_school_isolation ON "ExtensionPurgeReport" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
