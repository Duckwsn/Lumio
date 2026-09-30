import test from "node:test";
import assert from "node:assert/strict";
import type { HouseHistoryEntry, HouseLibraryItem } from "@lumio/shared";
import { mediaIdentity, projectLibraryMedia, publicHistory, recentHouseMedia } from "./socialLibrary.js";

const member = { id: "a", displayName: "A", color: "#fff" };
const entry = (id: string, at: string, provider: "youtube" | "google-drive" = "youtube"): HouseHistoryEntry => ({
  id: `history-${id}-${at}`, provider, providerMediaId: id, type: "video", title: `Title ${id}`,
  playedAt: at, startedBy: member,
});

test("canonical media identity includes provider and stable ID, not title", () => {
  assert.notEqual(mediaIdentity(entry("same", "2026-01-01", "youtube")), mediaIdentity(entry("same", "2026-01-01", "google-drive")));
});

test("recent House media deduplicates playback, counts occurrences and orders by last play", () => {
  const recent = recentHouseMedia([entry("a", "2026-01-01"), entry("b", "2026-01-02"), entry("a", "2026-01-03")]);
  assert.deepEqual(recent.map((item) => [item.providerMediaId, item.playCount, item.playedAt]), [
    ["a", 2, "2026-01-03"], ["b", 1, "2026-01-02"],
  ]);
});

test("private Drive metadata is restricted for another member even if a grant exists", () => {
  const drive: HouseLibraryItem = {
    id: "media", provider: "google-drive", providerMediaId: "private-file", type: "video", title: "Confidential video",
    thumbnail: "https://private.example/thumb", creator: "Secret", duration: 120,
    mimeType: "video/mp4", metadata: { secret: "do-not-share" }, canonicalUrl: "https://private.example/file",
    addedBy: member, addedAt: "2026-01-01", favorite: true,
  };
  const other = projectLibraryMedia(drive, "b", true);
  assert.equal(other.available, true);
  assert.equal(other.title, "Arquivo privado do Google Drive");
  assert.equal(other.thumbnail, undefined);
  assert.equal(other.duration, undefined);
  assert.equal(other.metadata, undefined);
  assert.equal(other.canonicalUrl, undefined);
  assert.equal(projectLibraryMedia(drive, "b", false).available, false);
  assert.equal(projectLibraryMedia(drive, "a", false).title, drive.title);
  const socket = publicHistory([entry("private-file", "2026-01-02", "google-drive")]);
  assert.equal(socket[0].providerMediaId, "");
  assert.equal(socket[0].title, "Arquivo privado do Google Drive");
});
