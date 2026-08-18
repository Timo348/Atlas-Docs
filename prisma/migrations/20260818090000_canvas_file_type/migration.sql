ALTER TYPE "PageFormat" ADD VALUE 'CANVAS';

ALTER TABLE "Page"
ADD COLUMN "legacyCanvasMigrationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "legacyCanvasTargetId" TEXT;

-- Rows created by the new application never contained an embedded canvas.
-- Existing rows retain 0 until the Yjs-aware post-migration step processes them.
ALTER TABLE "Page"
ALTER COLUMN "legacyCanvasMigrationVersion" SET DEFAULT 1;

CREATE UNIQUE INDEX "Page_legacyCanvasTargetId_key"
ON "Page"("legacyCanvasTargetId");

CREATE INDEX "Page_legacyCanvasMigrationVersion_idx"
ON "Page"("legacyCanvasMigrationVersion");
