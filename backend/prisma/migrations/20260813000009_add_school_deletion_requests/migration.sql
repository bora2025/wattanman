CREATE TABLE "SchoolDeletionRequest" (
    "id" TEXT NOT NULL,
    "deletedSchoolId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolSubdomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalReason" TEXT,
    "executedBy" TEXT,
    "changeTicket" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "dbSummary" JSONB,
    "storageSummary" JSONB,
    "reportStorageKey" TEXT,
    "reportChecksum" TEXT,
    "reportKeyId" TEXT,
    "reportPayload" JSONB,
    "reportSignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolDeletionRequest_reportStorageKey_key" ON "SchoolDeletionRequest"("reportStorageKey");
CREATE INDEX "SchoolDeletionRequest_deletedSchoolId_createdAt_idx" ON "SchoolDeletionRequest"("deletedSchoolId", "createdAt");
CREATE INDEX "SchoolDeletionRequest_status_createdAt_idx" ON "SchoolDeletionRequest"("status", "createdAt");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_control_plane') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SchoolDeletionRequest" TO "wattaman_control_plane"; END IF;
END $$;
