ALTER TABLE "School" ADD COLUMN "storagePrefix" TEXT;
UPDATE "School" SET "storagePrefix" = 'schools/' || "id" WHERE "storagePrefix" IS NULL;
ALTER TABLE "School" ALTER COLUMN "storagePrefix" SET NOT NULL;
CREATE UNIQUE INDEX "School_storagePrefix_key" ON "School"("storagePrefix");
