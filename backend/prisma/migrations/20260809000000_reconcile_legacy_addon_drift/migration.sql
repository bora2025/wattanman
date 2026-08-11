-- AddonDefinition and request metadata historically reached production through
-- `prisma db push`. Reconstruct that shape only when the conversion migration
-- has not already run. On an existing converted database this deliberately does
-- nothing and therefore cannot recreate retired compatibility tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE migration_name = '20260810000001_unify_modules_as_extensions'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    CREATE TABLE IF NOT EXISTS "AddonDefinition" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'ADDON',
      "name" TEXT NOT NULL,
      "description" TEXT,
      "detailDescription" TEXT,
      "screenshotUrl" TEXT,
      "category" TEXT,
      "icon" TEXT,
      "price" DOUBLE PRECISION,
      "priceNote" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "themeConfig" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AddonDefinition_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "AddonDefinition_key_key" ON "AddonDefinition"("key");
    ALTER TABLE "SchoolAddon" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);
    ALTER TABLE "SchoolAddon" ADD COLUMN IF NOT EXISTS "requestedBy" TEXT;
  END IF;
END $$;
