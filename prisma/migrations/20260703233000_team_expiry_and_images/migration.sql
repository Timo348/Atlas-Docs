ALTER TABLE "User" ADD COLUMN "avatarData" BYTEA;
ALTER TABLE "User" ADD COLUMN "avatarMime" TEXT;
ALTER TABLE "Space" ADD COLUMN "imageData" BYTEA;
ALTER TABLE "Space" ADD COLUMN "imageMime" TEXT;
ALTER TABLE "TeamMember" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "TeamMember_userId_expiresAt_idx" ON "TeamMember"("userId", "expiresAt");
