import type { HouseHistoryEntry, MediaItem } from "@lumio/shared";

export const mediaIdentity = (item: Pick<MediaItem, "provider" | "providerMediaId">) => `${item.provider}:${item.providerMediaId}`;

// Playback occurrences stay intact for Previous; the House library shows one row
// per canonical media, ordered by its most recent *actual* playback.
export function recentHouseMedia(history: readonly HouseHistoryEntry[]): HouseHistoryEntry[] {
  const byIdentity = new Map<string, HouseHistoryEntry>();
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    const key = mediaIdentity(entry);
    const recent = byIdentity.get(key);
    if (recent) recent.playCount = (recent.playCount ?? 1) + 1;
    else byIdentity.set(key, { ...entry, playCount: 1 });
  }
  return [...byIdentity.values()];
}

const ownerOf = (item: MediaItem): string | undefined => {
  if ("addedBy" in item && item.addedBy && typeof item.addedBy === "object" && "id" in item.addedBy) return String(item.addedBy.id);
  if ("startedBy" in item && item.startedBy && typeof item.startedBy === "object" && "id" in item.startedBy) return String(item.startedBy.id);
  return undefined;
};

// A saved Drive reference is not a grant. Other members may learn that a
// reference exists, but never receive private file metadata through Library.
export function projectLibraryMedia<T extends MediaItem>(item: T, viewerId: string, driveAvailable: boolean): T {
  if (item.provider !== "google-drive") return item;
  if (ownerOf(item) === viewerId) return { ...item, available: driveAvailable };
  return {
    ...item, title: "Arquivo privado do Google Drive", thumbnail: undefined,
    duration: undefined, mimeType: undefined, metadata: undefined,
    creator: undefined, canonicalUrl: undefined, available: driveAvailable,
  };
}

export function publicHistory(history: readonly HouseHistoryEntry[]): HouseHistoryEntry[] {
  return history.map((entry) => entry.provider === "google-drive"
    ? { ...projectLibraryMedia(entry, "", false), providerMediaId: "" }
    : entry);
}
