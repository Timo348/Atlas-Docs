CREATE TABLE "FolderShare" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "permission" "PageSharePermission" NOT NULL DEFAULT 'VIEW',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FolderShare_tokenHash_key" ON "FolderShare"("tokenHash");
CREATE INDEX "FolderShare_folderId_revokedAt_idx" ON "FolderShare"("folderId", "revokedAt");
CREATE INDEX "FolderShare_expiresAt_idx" ON "FolderShare"("expiresAt");

ALTER TABLE "FolderShare"
ADD CONSTRAINT "FolderShare_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FolderShare"
ADD CONSTRAINT "FolderShare_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
