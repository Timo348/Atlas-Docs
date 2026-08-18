ALTER TABLE "User" ADD COLUMN "defaultSpaceId" TEXT;

CREATE INDEX "User_defaultSpaceId_idx" ON "User"("defaultSpaceId");

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultSpaceId_fkey"
FOREIGN KEY ("defaultSpaceId") REFERENCES "Space"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
