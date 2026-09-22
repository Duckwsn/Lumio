ALTER TABLE "Room" ADD COLUMN "queueRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QueueItem" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QueueItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "QueueItem" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "MediaHistory" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "GroupLibraryItem" ADD COLUMN "mediaId" TEXT;

CREATE TABLE "MediaItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerMediaId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'video',
  "title" TEXT NOT NULL,
  "creator" TEXT,
  "duration" REAL,
  "thumbnail" TEXT,
  "canonicalUrl" TEXT,
  "mimeType" TEXT,
  "metadata" TEXT,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Playlist" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Playlist_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Playlist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PlaylistItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playlistId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "addedById" TEXT NOT NULL,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlaylistItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlaylistItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "HouseFavorite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseFavorite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HouseFavorite_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HouseFavorite_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaItem_provider_providerMediaId_key" ON "MediaItem"("provider", "providerMediaId");
CREATE INDEX "MediaItem_title_idx" ON "MediaItem"("title");
CREATE INDEX "QueueItem_roomId_position_idx" ON "QueueItem"("roomId", "position");
CREATE INDEX "MediaHistory_roomId_playedAt_idx" ON "MediaHistory"("roomId", "playedAt");
CREATE INDEX "Playlist_groupId_updatedAt_idx" ON "Playlist"("groupId", "updatedAt");
CREATE UNIQUE INDEX "PlaylistItem_playlistId_mediaId_key" ON "PlaylistItem"("playlistId", "mediaId");
CREATE UNIQUE INDEX "PlaylistItem_playlistId_position_key" ON "PlaylistItem"("playlistId", "position");
CREATE INDEX "PlaylistItem_playlistId_position_idx" ON "PlaylistItem"("playlistId", "position");
CREATE UNIQUE INDEX "HouseFavorite_groupId_mediaId_key" ON "HouseFavorite"("groupId", "mediaId");
CREATE INDEX "HouseFavorite_groupId_createdAt_idx" ON "HouseFavorite"("groupId", "createdAt");
