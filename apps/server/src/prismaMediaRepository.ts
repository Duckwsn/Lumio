import { PrismaClient } from "@prisma/client";
import type { HouseHistoryEntry, HouseLibraryItem, MediaItem, QueueItem, RoomMode, RoomSettings, User } from "@lumio/shared";
import { RoomStore, type PersistedMediaHouse, type PlaylistRecord } from "./store.js";

const key = (item: { provider: string; providerMediaId: string }) => `${item.provider}:${item.providerMediaId}`;
const parseMetadata = (value: string | null): Record<string, unknown> | undefined => value ? JSON.parse(value) as Record<string, unknown> : undefined;
const encodeMetadata = (value: Record<string, unknown> | undefined) => value ? JSON.stringify(value) : null;

export class PrismaMediaRepository {
  private pending: Promise<void> = Promise.resolve();
  private failed = false;
  private readonly savedRevision = new Map<string, number>();
  constructor(private readonly db: PrismaClient, private readonly store: RoomStore, private readonly getUser: (id: string) => User | undefined) {}
  private actor(id: string) { const user = this.getUser(id); if (!user) throw new Error("Mídia referencia usuário ausente."); return { id, displayName: user.displayName, color: user.color }; }

  async load() {
    const [rooms, queue, history, library, favorites, playlists, media, progress] = await Promise.all([
      this.db.room.findMany(), this.db.queueItem.findMany({ orderBy: { position: "asc" } }),
      this.db.mediaHistory.findMany({ orderBy: { playedAt: "asc" } }), this.db.groupLibraryItem.findMany(),
      this.db.houseFavorite.findMany(), this.db.playlist.findMany({ include: { items: { orderBy: { position: "asc" } } } }),
      this.db.mediaItem.findMany(), this.db.playbackProgress.findMany(),
    ]);
    const mediaById = new Map(media.map((entry) => [entry.id, entry]));
    const mediaByKey = new Map(media.map((entry) => [key(entry), entry]));
    const asMedia = (entry: (typeof media)[number]): MediaItem => ({
      id: entry.id, provider: entry.provider as MediaItem["provider"], providerMediaId: entry.providerMediaId,
      type: entry.type as MediaItem["type"], title: entry.title, thumbnail: entry.thumbnail ?? undefined,
      duration: entry.duration ?? undefined, mimeType: entry.mimeType ?? undefined,
      metadata: parseMetadata(entry.metadata), creator: entry.creator ?? undefined,
      canonicalUrl: entry.canonicalUrl ?? undefined, available: entry.available,
    });
    const base = (entry: { provider: string; providerMediaId: string; type: string; title: string; thumbnail: string | null; duration: number | null; mimeType: string | null; metadata: string | null; mediaId: string | null }): MediaItem => {
      const canonical = entry.mediaId ? mediaById.get(entry.mediaId) : mediaByKey.get(key(entry));
      return { ...(canonical ? asMedia(canonical) : { id: key(entry), provider: entry.provider as MediaItem["provider"], providerMediaId: entry.providerMediaId, type: entry.type as MediaItem["type"], title: entry.title }),
        provider: entry.provider as MediaItem["provider"], providerMediaId: entry.providerMediaId,
        type: entry.type as MediaItem["type"], title: entry.title, thumbnail: entry.thumbnail ?? undefined,
        duration: entry.duration ?? undefined, mimeType: entry.mimeType ?? undefined, metadata: parseMetadata(entry.metadata) };
    };
    for (const room of rooms) {
      if (!this.store.getRoom(room.id)) continue;
      const snapshot: PersistedMediaHouse = {
        houseId: room.groupId, roomId: room.id, mode: room.mode as RoomMode, queueRevision: room.queueRevision,
        settings: { mediaControl: room.mediaControl as RoomSettings["mediaControl"], queueControl: room.queueControl as RoomSettings["queueControl"], skipVotingEnabled: room.skipVotingEnabled, skipVoteThreshold: room.skipVoteThreshold, autoplayNext: room.autoplayNext },
        queue: queue.filter((entry) => entry.roomId === room.id).map((entry): QueueItem => ({ ...base(entry), id: entry.id, addedBy: this.actor(entry.addedById), addedAt: entry.addedAt.toISOString(), position: entry.position, status: "queued" })),
        history: history.filter((entry) => entry.roomId === room.id).map((entry): HouseHistoryEntry => ({ ...base(entry), id: entry.id, startedBy: this.actor(entry.addedById), playedAt: entry.playedAt.toISOString() })),
        library: library.filter((entry) => entry.groupId === room.groupId).map((entry): HouseLibraryItem => ({ ...base(entry), addedBy: this.actor(entry.addedById), addedAt: entry.addedAt.toISOString(), favorite: false })),
        favoriteKeys: favorites.filter((entry) => entry.groupId === room.groupId).map((entry) => { const item = mediaById.get(entry.mediaId); if (!item) throw new Error("Favorito sem mídia."); return key(item); }),
        playlists: playlists.filter((entry) => entry.groupId === room.groupId).map((entry): PlaylistRecord => ({
          id: entry.id, houseId: entry.groupId, name: entry.name, description: entry.description ?? undefined,
          createdBy: this.actor(entry.createdById), createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString(),
          items: entry.items.map((item) => { const mediaRow = mediaById.get(item.mediaId); if (!mediaRow) throw new Error("Playlist sem mídia."); return { ...asMedia(mediaRow), itemId: item.id, position: item.position, addedBy: this.actor(item.addedById), addedAt: item.addedAt.toISOString() }; }),
        })),
      };
      this.store.restoreHouse(snapshot);
      this.savedRevision.set(room.id, room.queueRevision);
    }
    for (const entry of progress) {
      const mediaRow = mediaByKey.get(key(entry)); if (!mediaRow) continue;
      const user = this.getUser(entry.userId); if (!user) continue;
      const prior = this.store.snapshotProgress(entry.userId);
      prior.push({ item: { ...asMedia(mediaRow), addedBy: this.actor(user.id), addedAt: entry.updatedAt.toISOString() }, position: entry.position, updatedAt: entry.updatedAt.toISOString() });
      this.store.restoreProgress(entry.userId, prior);
    }
  }

  saveHouse(roomId: string) {
    if (this.failed) return Promise.reject(new Error("Persistência de mídia indisponível."));
    const snapshot = this.store.snapshotHouse(roomId);
    if (!snapshot) return Promise.reject(new Error("Party ausente para persistência."));
    const operation = this.pending.then(async () => {
      await this.db.$transaction(async (tx) => {
        const expected = this.savedRevision.get(roomId) ?? 0;
        const changed = await tx.room.updateMany({ where: { id: roomId, queueRevision: expected }, data: {
          mode: snapshot.mode, mediaControl: snapshot.settings.mediaControl, queueControl: snapshot.settings.queueControl,
          skipVotingEnabled: snapshot.settings.skipVotingEnabled, skipVoteThreshold: snapshot.settings.skipVoteThreshold,
          autoplayNext: snapshot.settings.autoplayNext, queueRevision: snapshot.queueRevision,
        } });
        if (changed.count !== 1) throw new Error("Conflito de revisão da Party.");
        const all = [...snapshot.queue, ...snapshot.history, ...snapshot.library, ...snapshot.playlists.flatMap((entry) => entry.items)];
        const mediaIds = new Map<string, string>();
        for (const item of new Map(all.map((entry) => [key(entry), entry])).values()) {
          const data = { provider: item.provider, providerMediaId: item.providerMediaId, type: item.type, title: item.title,
            thumbnail: item.thumbnail ?? null, duration: item.duration ?? null, mimeType: item.mimeType ?? null,
            metadata: encodeMetadata(item.metadata), creator: item.creator ?? null, canonicalUrl: item.canonicalUrl ?? null,
            available: item.available !== false };
          const stored = await tx.mediaItem.upsert({ where: { provider_providerMediaId: { provider: item.provider, providerMediaId: item.providerMediaId } }, create: data, update: data });
          mediaIds.set(key(item), stored.id);
        }
        await tx.queueItem.deleteMany({ where: { roomId } });
        if (snapshot.queue.length) await tx.queueItem.createMany({ data: snapshot.queue.map((entry, position) => ({ id: entry.id, roomId, addedById: entry.addedBy.id, provider: entry.provider, providerMediaId: entry.providerMediaId, type: entry.type, title: entry.title, thumbnail: entry.thumbnail ?? null, duration: entry.duration ?? null, mimeType: entry.mimeType ?? null, metadata: encodeMetadata(entry.metadata), addedAt: new Date(entry.addedAt), position, status: entry.status ?? "queued", mediaId: mediaIds.get(key(entry)) })) });
        await tx.mediaHistory.deleteMany({ where: { roomId } });
        if (snapshot.history.length) await tx.mediaHistory.createMany({ data: snapshot.history.map((entry) => ({ id: entry.id, roomId, addedById: entry.startedBy.id, provider: entry.provider, providerMediaId: entry.providerMediaId, type: entry.type, title: entry.title, thumbnail: entry.thumbnail ?? null, duration: entry.duration ?? null, mimeType: entry.mimeType ?? null, metadata: encodeMetadata(entry.metadata), playedAt: new Date(entry.playedAt), mediaId: mediaIds.get(key(entry)) })) });
        await tx.groupLibraryItem.deleteMany({ where: { groupId: snapshot.houseId } });
        if (snapshot.library.length) await tx.groupLibraryItem.createMany({ data: snapshot.library.map((entry) => ({ groupId: snapshot.houseId, addedById: entry.addedBy.id, provider: entry.provider, providerMediaId: entry.providerMediaId, type: entry.type, title: entry.title, thumbnail: entry.thumbnail ?? null, duration: entry.duration ?? null, mimeType: entry.mimeType ?? null, metadata: encodeMetadata(entry.metadata), addedAt: new Date(entry.addedAt), mediaId: mediaIds.get(key(entry)) })) });
        await tx.houseFavorite.deleteMany({ where: { groupId: snapshot.houseId } });
        if (snapshot.favoriteKeys.length) await tx.houseFavorite.createMany({ data: snapshot.favoriteKeys.map((favoriteKey) => { const entry = snapshot.library.find((item) => key(item) === favoriteKey); const mediaId = mediaIds.get(favoriteKey); if (!entry || !mediaId) throw new Error("Favorito sem biblioteca."); return { groupId: snapshot.houseId, mediaId, addedById: entry.addedBy.id }; }) });
        await tx.playlist.deleteMany({ where: { groupId: snapshot.houseId } });
        for (const playlist of snapshot.playlists) {
          await tx.playlist.create({ data: { id: playlist.id, groupId: snapshot.houseId, name: playlist.name, description: playlist.description ?? null, createdById: playlist.createdBy.id, createdAt: new Date(playlist.createdAt), updatedAt: new Date(playlist.updatedAt) } });
          if (playlist.items.length) await tx.playlistItem.createMany({ data: playlist.items.map((entry) => { const mediaId = mediaIds.get(key(entry)); if (!mediaId) throw new Error("Item de playlist sem mídia."); return { id: entry.itemId, playlistId: playlist.id, mediaId, position: entry.position, addedById: entry.addedBy.id, addedAt: new Date(entry.addedAt) }; }) });
        }
      });
      this.savedRevision.set(roomId, snapshot.queueRevision);
    });
    this.pending = operation.catch(() => { this.failed = true; });
    return operation;
  }

  async saveProgress(userId: string, item: QueueItem, position: number) {
    const media = await this.db.mediaItem.upsert({ where: { provider_providerMediaId: { provider: item.provider, providerMediaId: item.providerMediaId } }, create: { provider: item.provider, providerMediaId: item.providerMediaId, type: item.type, title: item.title, thumbnail: item.thumbnail ?? null, duration: item.duration ?? null, mimeType: item.mimeType ?? null, metadata: encodeMetadata(item.metadata) }, update: {} });
    await this.db.playbackProgress.upsert({ where: { userId_provider_providerMediaId: { userId, provider: item.provider, providerMediaId: item.providerMediaId } }, create: { userId, provider: item.provider, providerMediaId: item.providerMediaId, position, duration: media.duration }, update: { position, duration: media.duration } });
  }
  isHealthy() { return !this.failed; }
  async drain() { await this.pending; }
}
