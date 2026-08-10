CREATE TABLE "SchoolDomain" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MANAGED',
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolDomain_hostname_key" ON "SchoolDomain"("hostname");
CREATE INDEX "SchoolDomain_schoolId_status_idx" ON "SchoolDomain"("schoolId", "status");

ALTER TABLE "SchoolDomain"
ADD CONSTRAINT "SchoolDomain_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SchoolDomain" (
  "id", "schoolId", "hostname", "type", "status", "verifiedAt", "updatedAt"
)
SELECT
  'domain_' || md5("id" || ':' || "subdomain"),
  "id",
  lower("subdomain"),
  'LEGACY_ALIAS',
  'VERIFIED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "School"
ON CONFLICT ("hostname") DO NOTHING;

INSERT INTO "SchoolDomain" (
  "id", "schoolId", "hostname", "type", "status", "verifiedAt", "updatedAt"
)
SELECT
  'domain_' || md5("id" || ':' || "customDomain"),
  "id",
  lower("customDomain"),
  'CUSTOM',
  'VERIFIED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "School"
WHERE "customDomain" IS NOT NULL
ON CONFLICT ("hostname") DO NOTHING;
