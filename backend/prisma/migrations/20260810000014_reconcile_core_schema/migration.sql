-- Reconcile fields that historically reached production through db push and
-- add the durable daily metric table. Every operation is restart-safe.
UPDATE "ExtensionAlert" SET "schoolId" = 'PLATFORM' WHERE "schoolId" IS NULL;
ALTER TABLE "ExtensionAlert" ALTER COLUMN "schoolId" SET DEFAULT 'PLATFORM';
ALTER TABLE "ExtensionAlert" ALTER COLUMN "schoolId" SET NOT NULL;

ALTER TABLE "ExtensionApiMetric" ALTER COLUMN "schoolId" DROP DEFAULT;
ALTER TABLE "ExtensionApiMetric" ALTER COLUMN "schoolId" DROP NOT NULL;

ALTER TABLE "School" DROP COLUMN IF EXISTS "disabledModules";
ALTER TABLE "User" DROP COLUMN IF EXISTS "departmentId";

ALTER TABLE "SiteSetting" ADD COLUMN IF NOT EXISTS "font" TEXT NOT NULL DEFAULT 'inter';
ALTER TABLE "SiteSetting" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'light';
ALTER TABLE "SiteSetting" ADD COLUMN IF NOT EXISTS "radius" TEXT NOT NULL DEFAULT 'soft';
ALTER TABLE "SiteSetting" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT NOT NULL DEFAULT '#0284c7';

CREATE TABLE IF NOT EXISTS "SchoolDailyMetric" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "avgDurationMs" DOUBLE PRECISION,
  "p95DurationMs" DOUBLE PRECISION,
  "activeUserCount" INTEGER NOT NULL DEFAULT 0,
  "storageBytes" BIGINT NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolDailyMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SchoolDailyMetric_date_idx" ON "SchoolDailyMetric"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolDailyMetric_schoolId_date_key" ON "SchoolDailyMetric"("schoolId", "date");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolDailyMetric_schoolId_fkey') THEN
    ALTER TABLE "SchoolDailyMetric" ADD CONSTRAINT "SchoolDailyMetric_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
