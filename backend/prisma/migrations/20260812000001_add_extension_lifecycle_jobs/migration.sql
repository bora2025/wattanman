CREATE TABLE "ExtensionLifecycleJob" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "installationId" TEXT,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionLifecycleJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionLifecycleJob_schoolId_idempotencyKey_key" ON "ExtensionLifecycleJob"("schoolId", "idempotencyKey");
CREATE INDEX "ExtensionLifecycleJob_schoolId_status_updatedAt_idx" ON "ExtensionLifecycleJob"("schoolId", "status", "updatedAt");
CREATE INDEX "ExtensionLifecycleJob_extensionId_status_updatedAt_idx" ON "ExtensionLifecycleJob"("extensionId", "status", "updatedAt");
CREATE INDEX "ExtensionLifecycleJob_installationId_updatedAt_idx" ON "ExtensionLifecycleJob"("installationId", "updatedAt");

ALTER TABLE "ExtensionLifecycleJob"
ADD CONSTRAINT "ExtensionLifecycleJob_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE POLICY tenant_school_isolation ON "ExtensionLifecycleJob" AS PERMISSIVE FOR ALL TO PUBLIC
USING ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''))
WITH CHECK ("schoolId" = NULLIF(current_setting('app.current_school_id', true), ''));
