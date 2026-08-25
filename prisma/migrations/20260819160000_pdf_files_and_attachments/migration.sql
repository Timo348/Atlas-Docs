ALTER TYPE "PageFormat" ADD VALUE 'PDF';

CREATE TYPE "PageAssetKind" AS ENUM ('DOCUMENT', 'ATTACHMENT');

CREATE TABLE "PageAsset" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "kind" "PageAssetKind" NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageAsset_pageId_kind_createdAt_idx" ON "PageAsset"("pageId", "kind", "createdAt");

ALTER TABLE "PageAsset"
ADD CONSTRAINT "PageAsset_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageAsset"
ADD CONSTRAINT "PageAsset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
