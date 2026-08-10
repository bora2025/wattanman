ALTER TABLE "SchoolDomain"
ADD COLUMN "verificationToken" TEXT,
ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN "verificationError" TEXT;

CREATE UNIQUE INDEX "SchoolDomain_verificationToken_key"
ON "SchoolDomain"("verificationToken");
