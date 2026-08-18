CREATE TYPE "PageSharePermission" AS ENUM ('VIEW', 'EDIT');

CREATE TABLE "PageShare" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "permission" "PageSharePermission" NOT NULL DEFAULT 'VIEW',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageShare_tokenHash_key" ON "PageShare"("tokenHash");
CREATE INDEX "PageShare_pageId_revokedAt_idx" ON "PageShare"("pageId", "revokedAt");
CREATE INDEX "PageShare_expiresAt_idx" ON "PageShare"("expiresAt");

ALTER TABLE "PageShare"
ADD CONSTRAINT "PageShare_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageShare"
ADD CONSTRAINT "PageShare_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
