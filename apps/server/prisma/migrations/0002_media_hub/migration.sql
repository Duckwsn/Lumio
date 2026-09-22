ALTER TABLE "Room" ADD COLUMN "mediaControl" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "Room" ADD COLUMN "queueControl" TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE "Room" ADD COLUMN "skipVotingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Room" ADD COLUMN "skipVoteThreshold" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "QueueItem" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'video';
ALTER TABLE "QueueItem" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "QueueItem" ADD COLUMN "metadata" TEXT;
ALTER TABLE "MediaHistory" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'video';
ALTER TABLE "MediaHistory" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "MediaHistory" ADD COLUMN "metadata" TEXT;

CREATE TABLE "GroupLibraryItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMediaId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'video',
  "title" TEXT NOT NULL,
  "thumbnail" TEXT,
  "duration" REAL,
  "mimeType" TEXT,
  "metadata" TEXT,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupLibraryItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupLibraryItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GroupLibraryItem_groupId_provider_providerMediaId_key" ON "GroupLibraryItem"("groupId", "provider", "providerMediaId");

CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMediaId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'video',
  "title" TEXT NOT NULL,
  "thumbnail" TEXT,
  "duration" REAL,
  "mimeType" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Favorite_userId_provider_providerMediaId_key" ON "Favorite"("userId", "provider", "providerMediaId");

CREATE TABLE "PlaybackProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMediaId" TEXT NOT NULL,
  "position" REAL NOT NULL,
  "duration" REAL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlaybackProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlaybackProgress_userId_provider_providerMediaId_key" ON "PlaybackProgress"("userId", "provider", "providerMediaId");
