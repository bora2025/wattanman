ALTER TABLE "Extension" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'UNLISTED';
UPDATE "Extension" SET "visibility" = CASE WHEN "isListed" THEN 'LISTED' ELSE 'UNLISTED' END;
CREATE INDEX "Extension_visibility_status_idx" ON "Extension"("visibility", "status");

CREATE TABLE "ExtensionVisibilityGrant" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionVisibilityGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionVisibilityGrant_extensionId_schoolId_key" ON "ExtensionVisibilityGrant"("extensionId", "schoolId");
CREATE INDEX "ExtensionVisibilityGrant_schoolId_createdAt_idx" ON "ExtensionVisibilityGrant"("schoolId", "createdAt");
ALTER TABLE "ExtensionVisibilityGrant" ADD CONSTRAINT "ExtensionVisibilityGrant_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionVisibilityGrant" ADD CONSTRAINT "ExtensionVisibilityGrant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExtensionApiMetric" (
    "id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusClass" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL DEFAULT 'PLATFORM',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "maxDurationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionApiMetric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionApiMetric_bucket_route_method_statusClass_schoolId_key" ON "ExtensionApiMetric"("bucket", "route", "method", "statusClass", "schoolId");
CREATE INDEX "ExtensionApiMetric_bucket_route_idx" ON "ExtensionApiMetric"("bucket", "route");
CREATE INDEX "ExtensionApiMetric_schoolId_bucket_idx" ON "ExtensionApiMetric"("schoolId", "bucket");
