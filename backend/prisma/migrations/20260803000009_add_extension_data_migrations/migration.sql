CREATE TABLE "ExtensionMigrationRun" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "operations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionMigrationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExtensionMigrationRun_installationId_createdAt_idx" ON "ExtensionMigrationRun"("installationId", "createdAt");
CREATE INDEX "ExtensionMigrationRun_schoolId_extensionId_status_idx" ON "ExtensionMigrationRun"("schoolId", "extensionId", "status");
ALTER TABLE "ExtensionMigrationRun" ADD CONSTRAINT "ExtensionMigrationRun_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ExtensionInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExtensionMigrationBackup" (
    "id" TEXT NOT NULL,
    "migrationRunId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionMigrationBackup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionMigrationBackup_migrationRunId_recordId_key" ON "ExtensionMigrationBackup"("migrationRunId", "recordId");
CREATE INDEX "ExtensionMigrationBackup_recordId_idx" ON "ExtensionMigrationBackup"("recordId");
ALTER TABLE "ExtensionMigrationBackup" ADD CONSTRAINT "ExtensionMigrationBackup_migrationRunId_fkey" FOREIGN KEY ("migrationRunId") REFERENCES "ExtensionMigrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
