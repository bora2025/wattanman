-- Adds governed publisher identity while retaining Extension.publisher as a
-- denormalized display value for compatibility with the first rollout.

CREATE TABLE "ExtensionPublisher" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionPublisher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionPublisher_key_key" ON "ExtensionPublisher"("key");
CREATE INDEX "ExtensionPublisher_status_internal_idx" ON "ExtensionPublisher"("status", "internal");

INSERT INTO "ExtensionPublisher" ("id", "key", "name", "status", "internal", "updatedAt")
VALUES ('publisher_wattaman', 'WATTAMAN', 'Wattaman', 'ACTIVE', true, CURRENT_TIMESTAMP);

ALTER TABLE "Extension" ADD COLUMN "publisherId" TEXT;
UPDATE "Extension" SET "publisherId" = 'publisher_wattaman' WHERE "publisherId" IS NULL;
ALTER TABLE "Extension" ALTER COLUMN "publisherId" SET NOT NULL;
CREATE INDEX "Extension_publisherId_status_idx" ON "Extension"("publisherId", "status");
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "ExtensionPublisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
