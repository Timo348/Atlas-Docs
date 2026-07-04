ALTER TABLE "User"
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "colorTheme" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "uiFont" TEXT NOT NULL DEFAULT 'inter',
ADD COLUMN "editorFont" TEXT NOT NULL DEFAULT 'mono',
ADD COLUMN "fontSize" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "compactMode" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PageImage" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageImage_pageId_createdAt_idx" ON "PageImage"("pageId", "createdAt");

ALTER TABLE "PageImage"
ADD CONSTRAINT "PageImage_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageImage"
ADD CONSTRAINT "PageImage_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
