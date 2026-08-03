CREATE TABLE "ExtensionPublisherMember" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionPublisherMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionReview" (
    "id" TEXT NOT NULL,
    "extensionVersionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionPublisherMember_publisherId_userId_key" ON "ExtensionPublisherMember"("publisherId", "userId");
CREATE INDEX "ExtensionPublisherMember_userId_status_idx" ON "ExtensionPublisherMember"("userId", "status");
CREATE INDEX "ExtensionReview_extensionVersionId_createdAt_idx" ON "ExtensionReview"("extensionVersionId", "createdAt");
CREATE INDEX "ExtensionReview_action_createdAt_idx" ON "ExtensionReview"("action", "createdAt");

ALTER TABLE "ExtensionPublisherMember" ADD CONSTRAINT "ExtensionPublisherMember_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "ExtensionPublisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionPublisherMember" ADD CONSTRAINT "ExtensionPublisherMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionReview" ADD CONSTRAINT "ExtensionReview_extensionVersionId_fkey"
    FOREIGN KEY ("extensionVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ExtensionPublisherMember" ("id", "publisherId", "userId", "roles", "status", "updatedAt")
SELECT 'publisher_member_' || u."id", p."id", u."id", '["UPLOAD","REVIEW","PUBLISH","MANAGE"]'::jsonb, 'ACTIVE', CURRENT_TIMESTAMP
FROM "User" u
JOIN "School" s ON s."id" = u."schoolId" AND s."subdomain" = 'platform'
JOIN "ExtensionPublisher" p ON p."key" = 'WATTAMAN'
WHERE u."role" = 'PLATFORM_ADMIN'
ON CONFLICT ("publisherId", "userId") DO NOTHING;
