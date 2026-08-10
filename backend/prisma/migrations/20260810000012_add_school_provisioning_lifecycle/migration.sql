ALTER TABLE "School" ALTER COLUMN "status" SET DEFAULT 'PROVISIONING';

CREATE TABLE "SchoolProvisioningJob" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolProvisioningJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolProvisioningJob_requestKey_key" ON "SchoolProvisioningJob"("requestKey");
CREATE INDEX "SchoolProvisioningJob_schoolId_status_idx" ON "SchoolProvisioningJob"("schoolId", "status");
ALTER TABLE "SchoolProvisioningJob" ADD CONSTRAINT "SchoolProvisioningJob_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
