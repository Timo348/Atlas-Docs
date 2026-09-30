-- CreateEnum
CREATE TYPE "TodoIndexState" AS ENUM ('PENDING', 'INDEXED', 'ERROR');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "todoIndexError" TEXT,
ADD COLUMN     "todoIndexState" "TodoIndexState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "todoIndexedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TodoTaskIndex" (
    "pageId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "column" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "deadline" TEXT,
    "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodoTaskIndex_pkey" PRIMARY KEY ("pageId","taskId")
);

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "start" TEXT,
    "end" TEXT,
    "dueDate" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "recurrence" JSONB,
    "recurrenceUntil" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "patch" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarPreference" (
    "userId" TEXT NOT NULL,
    "view" TEXT NOT NULL DEFAULT 'dayGridMonth',
    "selectedSpaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knownSpaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taskScope" TEXT NOT NULL DEFAULT 'all',
    "showCompleted" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "TodoTaskIndex_spaceId_deadline_column_idx" ON "TodoTaskIndex"("spaceId", "deadline", "column");

-- CreateIndex
CREATE INDEX "TodoTaskIndex_deadline_column_idx" ON "TodoTaskIndex"("deadline", "column");

-- CreateIndex
CREATE INDEX "TodoTaskIndex_assigneeIds_idx" ON "TodoTaskIndex" USING GIN ("assigneeIds");

-- CreateIndex
CREATE INDEX "CalendarEntry_userId_kind_start_idx" ON "CalendarEntry"("userId", "kind", "start");

-- CreateIndex
CREATE INDEX "CalendarEntry_userId_dueDate_idx" ON "CalendarEntry"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "CalendarException_userId_idx" ON "CalendarException"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_entryId_occurrenceKey_key" ON "CalendarException"("entryId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "Page_format_todoIndexState_idx" ON "Page"("format", "todoIndexState");

-- CreateIndex
CREATE UNIQUE INDEX "Page_id_spaceId_key" ON "Page"("id", "spaceId");

-- AddForeignKey
ALTER TABLE "TodoTaskIndex" ADD CONSTRAINT "TodoTaskIndex_pageId_spaceId_fkey" FOREIGN KEY ("pageId", "spaceId") REFERENCES "Page"("id", "spaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTaskIndex" ADD CONSTRAINT "TodoTaskIndex_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CalendarEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
