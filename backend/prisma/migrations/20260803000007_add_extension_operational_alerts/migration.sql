CREATE TABLE "ExtensionAlert" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "extensionId" TEXT,
    "versionId" TEXT,
    "schoolId" TEXT,
    "message" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "details" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionAlert_fingerprint_key" ON "ExtensionAlert"("fingerprint");
CREATE INDEX "ExtensionAlert_status_severity_lastSeenAt_idx" ON "ExtensionAlert"("status", "severity", "lastSeenAt");
CREATE INDEX "ExtensionAlert_extensionId_lastSeenAt_idx" ON "ExtensionAlert"("extensionId", "lastSeenAt");
