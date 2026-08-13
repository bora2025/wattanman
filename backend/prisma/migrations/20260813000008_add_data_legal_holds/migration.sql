CREATE TABLE "DataLegalHold" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL DEFAULT '',
    "caseReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataLegalHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DataLegalHold_schoolId_category_resourceId_key" ON "DataLegalHold"("schoolId", "category", "resourceId");
CREATE INDEX "DataLegalHold_schoolId_active_category_idx" ON "DataLegalHold"("schoolId", "active", "category");
CREATE INDEX "DataLegalHold_caseReference_idx" ON "DataLegalHold"("caseReference");
ALTER TABLE "DataLegalHold" ADD CONSTRAINT "DataLegalHold_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE POLICY tenant_school_isolation ON "DataLegalHold" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_school_runtime') THEN GRANT SELECT ON TABLE "DataLegalHold" TO "wattaman_school_runtime"; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wattaman_control_plane') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DataLegalHold" TO "wattaman_control_plane"; END IF;
END $$;
