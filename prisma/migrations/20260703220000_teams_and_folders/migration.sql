CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

CREATE TABLE "TeamMember" (
  "userId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("userId","teamId")
);

CREATE TABLE "SpaceTeamAccess" (
  "teamId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "role" "SpaceRole" NOT NULL DEFAULT 'VIEWER',
  CONSTRAINT "SpaceTeamAccess_pkey" PRIMARY KEY ("teamId","spaceId")
);

CREATE TABLE "Folder" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Page" ADD COLUMN "folderId" TEXT;

CREATE UNIQUE INDEX "Folder_spaceId_parentId_name_key" ON "Folder"("spaceId", "parentId", "name");
CREATE INDEX "Folder_spaceId_parentId_idx" ON "Folder"("spaceId", "parentId");
CREATE INDEX "Page_spaceId_folderId_idx" ON "Page"("spaceId", "folderId");

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaceTeamAccess" ADD CONSTRAINT "SpaceTeamAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpaceTeamAccess" ADD CONSTRAINT "SpaceTeamAccess_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Page" ADD CONSTRAINT "Page_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
