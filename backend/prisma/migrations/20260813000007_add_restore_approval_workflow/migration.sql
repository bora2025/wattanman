CREATE TABLE "BackupRestoreRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "requestedBy" TEXT,
    "requestedRole" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationReport" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalReason" TEXT,
    "executedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackupRestoreRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BackupRestoreRequest_schoolId_requestKey_key" ON "BackupRestoreRequest"("schoolId", "requestKey");
CREATE INDEX "BackupRestoreRequest_schoolId_createdAt_idx" ON "BackupRestoreRequest"("schoolId", "createdAt");
CREATE INDEX "BackupRestoreRequest_status_createdAt_idx" ON "BackupRestoreRequest"("status", "createdAt");
CREATE INDEX "BackupRestoreRequest_exportId_idx" ON "BackupRestoreRequest"("exportId");
ALTER TABLE "BackupRestoreRequest" ADD CONSTRAINT "BackupRestoreRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE POLICY tenant_school_isolation ON "BackupRestoreRequest" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_school_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BackupRestoreRequest" TO "wattaman_school_runtime";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_control_plane') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BackupRestoreRequest" TO "wattaman_control_plane";
  END IF;
END $$;
