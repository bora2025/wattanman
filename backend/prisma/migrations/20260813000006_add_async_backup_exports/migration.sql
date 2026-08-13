CREATE TABLE "BackupExport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "checksum" TEXT,
    "byteSize" INTEGER,
    "modelCount" INTEGER,
    "rowCount" INTEGER,
    "requestedBy" TEXT,
    "requestedRole" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackupExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackupExport_storageKey_key" ON "BackupExport"("storageKey");
CREATE UNIQUE INDEX "BackupExport_schoolId_requestKey_key" ON "BackupExport"("schoolId", "requestKey");
CREATE INDEX "BackupExport_schoolId_createdAt_idx" ON "BackupExport"("schoolId", "createdAt");
CREATE INDEX "BackupExport_status_createdAt_idx" ON "BackupExport"("status", "createdAt");
ALTER TABLE "BackupExport" ADD CONSTRAINT "BackupExport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE POLICY tenant_school_isolation ON "BackupExport" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_school_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BackupExport" TO "wattaman_school_runtime";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_control_plane') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BackupExport" TO "wattaman_control_plane";
  END IF;
END $$;
