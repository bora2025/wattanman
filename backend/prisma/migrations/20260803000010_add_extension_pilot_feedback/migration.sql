CREATE TABLE "ExtensionPilotFeedback" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "checklist" JSONB NOT NULL,
    "comments" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionPilotFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExtensionPilotFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "ExtensionPilotFeedback_source_check" CHECK ("source" IN ('SCHOOL_ADMIN', 'OPERATOR')),
    CONSTRAINT "ExtensionPilotFeedback_outcome_check" CHECK ("outcome" IN ('ACCEPTED', 'NEEDS_WORK', 'BLOCKED'))
);

CREATE UNIQUE INDEX "ExtensionPilotFeedback_installationId_source_key" ON "ExtensionPilotFeedback"("installationId", "source");
CREATE INDEX "ExtensionPilotFeedback_schoolId_createdAt_idx" ON "ExtensionPilotFeedback"("schoolId", "createdAt");
CREATE INDEX "ExtensionPilotFeedback_outcome_updatedAt_idx" ON "ExtensionPilotFeedback"("outcome", "updatedAt");

ALTER TABLE "ExtensionPilotFeedback" ADD CONSTRAINT "ExtensionPilotFeedback_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ExtensionInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionPilotFeedback" ADD CONSTRAINT "ExtensionPilotFeedback_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
