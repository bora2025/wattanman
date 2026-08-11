ALTER TABLE "Extension"
  ADD COLUMN "featuredRank" INTEGER NOT NULL DEFAULT 1000000;

CREATE INDEX "Extension_featuredRank_createdAt_idx"
  ON "Extension"("featuredRank", "createdAt");

CREATE TABLE "ExtensionCatalogCollection" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExtensionCatalogCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionCatalogCollectionItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "extensionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtensionCatalogCollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionCatalogCollection_slug_key" ON "ExtensionCatalogCollection"("slug");
CREATE INDEX "ExtensionCatalogCollection_status_sortOrder_idx" ON "ExtensionCatalogCollection"("status", "sortOrder");
CREATE UNIQUE INDEX "ExtensionCatalogCollectionItem_collectionId_extensionId_key" ON "ExtensionCatalogCollectionItem"("collectionId", "extensionId");
CREATE INDEX "ExtensionCatalogCollectionItem_collectionId_position_idx" ON "ExtensionCatalogCollectionItem"("collectionId", "position");
CREATE INDEX "ExtensionCatalogCollectionItem_extensionId_idx" ON "ExtensionCatalogCollectionItem"("extensionId");

ALTER TABLE "ExtensionCatalogCollectionItem"
  ADD CONSTRAINT "ExtensionCatalogCollectionItem_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "ExtensionCatalogCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtensionCatalogCollectionItem"
  ADD CONSTRAINT "ExtensionCatalogCollectionItem_extensionId_fkey"
  FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
