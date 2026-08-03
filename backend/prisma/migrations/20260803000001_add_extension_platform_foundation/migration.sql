-- Additive foundation for the versioned extension platform.
-- Existing AddonDefinition and SchoolAddon tables remain unchanged so the
-- current catalog, billing, and feature gates continue operating during the
-- compatibility rollout.

CREATE TABLE "Extension" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "runtimeType" TEXT NOT NULL,
    "commercialType" TEXT NOT NULL,
    "category" TEXT,
    "publisher" TEXT NOT NULL DEFAULT 'WATTAMAN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "legacyAddonKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionVersion" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifestSchema" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "packageStorageKey" TEXT,
    "packageChecksum" TEXT,
    "packageSize" INTEGER,
    "compatibilityRange" TEXT,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "reviewNotes" TEXT,
    "releaseNotes" TEXT,
    "uploadedBy" TEXT,
    "reviewedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionAsset" (
    "id" TEXT NOT NULL,
    "extensionVersionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionPermission" (
    "id" TEXT NOT NULL,
    "extensionVersionId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "description" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionDependency" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "requiredExtensionId" TEXT NOT NULL,
    "versionRange" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionValidation" (
    "id" TEXT NOT NULL,
    "extensionVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errors" JSONB,
    "warnings" JSONB,
    "validatorVersion" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionValidation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionInstallation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "installedVersionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB,
    "billingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "installedBy" TEXT,
    "installedAt" TIMESTAMP(3),
    "uninstalledAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Extension_key_key" ON "Extension"("key");
CREATE UNIQUE INDEX "Extension_legacyAddonKey_key" ON "Extension"("legacyAddonKey");
CREATE INDEX "Extension_runtimeType_status_idx" ON "Extension"("runtimeType", "status");
CREATE INDEX "Extension_commercialType_isListed_idx" ON "Extension"("commercialType", "isListed");

CREATE UNIQUE INDEX "ExtensionVersion_extensionId_version_key" ON "ExtensionVersion"("extensionId", "version");
CREATE INDEX "ExtensionVersion_extensionId_lifecycleStatus_idx" ON "ExtensionVersion"("extensionId", "lifecycleStatus");
CREATE INDEX "ExtensionVersion_lifecycleStatus_createdAt_idx" ON "ExtensionVersion"("lifecycleStatus", "createdAt");
CREATE INDEX "ExtensionVersion_packageChecksum_idx" ON "ExtensionVersion"("packageChecksum");

CREATE UNIQUE INDEX "ExtensionAsset_extensionVersionId_path_key" ON "ExtensionAsset"("extensionVersionId", "path");
CREATE INDEX "ExtensionAsset_extensionVersionId_idx" ON "ExtensionAsset"("extensionVersionId");

CREATE UNIQUE INDEX "ExtensionPermission_extensionVersionId_capability_key" ON "ExtensionPermission"("extensionVersionId", "capability");
CREATE INDEX "ExtensionPermission_capability_idx" ON "ExtensionPermission"("capability");

CREATE UNIQUE INDEX "ExtensionDependency_extensionId_requiredExtensionId_key" ON "ExtensionDependency"("extensionId", "requiredExtensionId");
CREATE INDEX "ExtensionDependency_requiredExtensionId_idx" ON "ExtensionDependency"("requiredExtensionId");

CREATE INDEX "ExtensionValidation_extensionVersionId_startedAt_idx" ON "ExtensionValidation"("extensionVersionId", "startedAt");
CREATE INDEX "ExtensionValidation_status_startedAt_idx" ON "ExtensionValidation"("status", "startedAt");

CREATE UNIQUE INDEX "ExtensionInstallation_schoolId_extensionId_key" ON "ExtensionInstallation"("schoolId", "extensionId");
CREATE INDEX "ExtensionInstallation_schoolId_enabled_idx" ON "ExtensionInstallation"("schoolId", "enabled");
CREATE INDEX "ExtensionInstallation_extensionId_installedVersionId_idx" ON "ExtensionInstallation"("extensionId", "installedVersionId");
CREATE INDEX "ExtensionInstallation_purgeAfter_idx" ON "ExtensionInstallation"("purgeAfter");
CREATE INDEX "ExtensionRecord_schoolId_extensionId_resource_createdAt_idx" ON "ExtensionRecord"("schoolId", "extensionId", "resource", "createdAt");
CREATE INDEX "ExtensionRecord_extensionId_resource_idx" ON "ExtensionRecord"("extensionId", "resource");

ALTER TABLE "ExtensionVersion" ADD CONSTRAINT "ExtensionVersion_extensionId_fkey"
    FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionAsset" ADD CONSTRAINT "ExtensionAsset_extensionVersionId_fkey"
    FOREIGN KEY ("extensionVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionPermission" ADD CONSTRAINT "ExtensionPermission_extensionVersionId_fkey"
    FOREIGN KEY ("extensionVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionDependency" ADD CONSTRAINT "ExtensionDependency_extensionId_fkey"
    FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionDependency" ADD CONSTRAINT "ExtensionDependency_requiredExtensionId_fkey"
    FOREIGN KEY ("requiredExtensionId") REFERENCES "Extension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtensionValidation" ADD CONSTRAINT "ExtensionValidation_extensionVersionId_fkey"
    FOREIGN KEY ("extensionVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionInstallation" ADD CONSTRAINT "ExtensionInstallation_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionInstallation" ADD CONSTRAINT "ExtensionInstallation_extensionId_fkey"
    FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtensionInstallation" ADD CONSTRAINT "ExtensionInstallation_installedVersionId_fkey"
    FOREIGN KEY ("installedVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtensionRecord" ADD CONSTRAINT "ExtensionRecord_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionRecord" ADD CONSTRAINT "ExtensionRecord_extensionId_fkey"
    FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
