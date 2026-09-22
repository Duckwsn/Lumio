import crypto from "node:crypto";
import {
  type ChatMessage,
  type HouseHistoryEntry,
  type HouseLibraryItem,
  type MediaItem,
  type MediaState,
  type Playlist,
  type PlaylistItem,
  type QueueItem,
  type RoomMember,
  type RoomMode,
  type RoomSettings,
  type RoomSnapshot,
  type Role,
  type ScreenShareState,
  type User,
} from "@lumio/shared";

export interface GroupSummary {
  id: string;
  name: string;
  initials: string;
  memberCount: number;
  rooms: Array<{ id: string; name: string; accent: string; connectedCount: number }>;
}

interface PlaylistRecord extends Omit<Playlist, "itemCount" | "items"> { items: PlaylistItem[] }

export interface RoomRecord {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  accent: string;
  mode: RoomMode;
  members: Map<string, RoomMember>;
  queue: QueueItem[];
  queueRevision: number;
  history: HouseHistoryEntry[];
  currentItem: QueueItem | null;
  historyMediaKey: string | null;
  votes: Set<string>;
  settings: RoomSettings;
  currentMedia: MediaState;
  messages: ChatMessage[];
  screenShare: ScreenShareState;
}

const now = new Date().toISOString();
const mediaKey = (item: Pick<MediaItem, "provider" | "providerMediaId">) => `${item.provider}:${item.providerMediaId}`;
const actor = (user: User) => ({ id: user.id, displayName: user.displayName, color: user.color });
const asMedia = (item: MediaItem): MediaItem => ({
  id: item.id, provider: item.provider, providerMediaId: item.providerMediaId, type: item.type, title: item.title,
  thumbnail: item.thumbnail, duration: item.duration, mimeType: item.mimeType, metadata: item.metadata,
  creator: item.creator, canonicalUrl: item.canonicalUrl, available: item.available,
});

export class RoomStore {
  private readonly groups = new Map<string, GroupSummary>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly mediaCatalog = new Map<string, MediaItem>();
  private readonly libraries = new Map<string, Map<string, HouseLibraryItem>>();
  private readonly favorites = new Map<string, Set<string>>();
  private readonly playlists = new Map<string, Map<string, PlaylistRecord>>();
  private readonly progress = new Map<string, Map<string, { item: QueueItem; position: number; updatedAt: string }>>();

  constructor() {
    const group: GroupSummary = { id: "group-silva", name: "Casa Silva", initials: "CS", memberCount: 6, rooms: [] };
    this.groups.set(group.id, group);
    this.createRoom({ id: "cinema", name: "Party", accent: "green", group, mode: "watch" });
  }

  private createRoom(input: { id: string; name: string; accent: string; group: GroupSummary; mode: RoomMode }) {
    const demoUser: User = { id: "system", displayName: "Lumio", color: "#78b695" };
    const room: RoomRecord = {
      id: input.id, name: input.name, groupId: input.group.id, groupName: input.group.name, accent: input.accent, mode: input.mode,
      members: new Map(), queue: [], queueRevision: 0, history: [], currentItem: null, historyMediaKey: null, votes: new Set(),
      settings: { mediaControl: "everyone", queueControl: "everyone", skipVotingEnabled: true, skipVoteThreshold: 60, autoplayNext: true },
      currentMedia: { mediaId: "", provider: "demo", type: "video", title: "Nenhuma mídia", state: "idle", position: 0, duration: 0, playbackRate: 1, startedAt: null, updatedAt: Date.now(), controlledBy: demoUser.id, revision: 0 },
      messages: [{ id: "welcome-message", roomId: input.id, user: demoUser, body: "A Party está pronta. Adicione uma mídia para começar.", createdAt: now }],
      screenShare: null,
    };
    this.rooms.set(room.id, room);
    input.group.rooms.push({ id: room.id, name: room.name, accent: room.accent, connectedCount: 0 });
  }

  addHouseRoom(input: { houseId: string; houseName: string; roomId: string }) {
    if (this.rooms.has(input.roomId)) return;
    const group: GroupSummary = { id: input.houseId, name: input.houseName, initials: input.houseName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(), memberCount: 1, rooms: [] };
    this.groups.set(group.id, group);
    this.createRoom({ id: input.roomId, name: "Party", accent: "green", group, mode: "watch" });
  }

  listGroups() { return [...this.groups.values()].map((group) => ({ ...group, rooms: group.rooms.map((room) => ({ ...room, connectedCount: this.rooms.get(room.id)?.members.size ?? 0 })) })); }
  getRoom(roomId: string) { return this.rooms.get(roomId); }
  getQueueRevision(roomId: string) { return this.rooms.get(roomId)?.queueRevision ?? 0; }

  private requiredVotes(room: RoomRecord) { if (!room.settings.skipVotingEnabled) return 0; return room.members.size <= 1 ? 1 : Math.max(2, Math.ceil(room.members.size * room.settings.skipVoteThreshold / 100)); }
  private normalizeQueue(room: RoomRecord) { const currentKey = `${room.currentMedia.provider}:${room.currentMedia.mediaId}`; room.queue = room.queue.map((item, position) => ({ ...item, position, status: mediaKey(item) === currentKey ? "playing" : "queued" })); return room.queue; }
  private bumpQueue(room: RoomRecord) { room.queueRevision += 1; return this.normalizeQueue(room); }

  getSnapshot(roomId: string): RoomSnapshot | null {
    const room = this.rooms.get(roomId); if (!room) return null;
    return {
      id: room.id, name: room.name, groupName: room.groupName, accent: room.accent, mode: room.mode,
      members: [...room.members.values()], queue: this.normalizeQueue(room), queueRevision: room.queueRevision, history: room.history.slice(-100),
      skipVote: { count: room.votes.size, required: this.requiredVotes(room), votedBy: [...room.votes] }, settings: room.settings,
      currentMedia: this.getEffectiveMedia(room.currentMedia), messages: room.messages.slice(-80), connectedCount: room.members.size, screenShare: room.screenShare,
    };
  }

  addMember(roomId: string, user: User, role?: Role) { const room = this.rooms.get(roomId); if (!room) return null; const existing = room.members.get(user.id); room.members.set(user.id, { user, role: existing?.role ?? role ?? (room.members.size === 0 ? "HOST" : "MEMBER"), presence: "online", speaking: false, muted: false, deafened: false, joinedAt: existing?.joinedAt ?? new Date().toISOString() }); return this.getSnapshot(roomId); }
  removeMember(roomId: string, userId: string) { const room = this.rooms.get(roomId); if (!room) return null; room.members.delete(userId); room.votes.delete(userId); if (room.screenShare?.user.id === userId) room.screenShare = null; return this.getSnapshot(roomId); }
  updatePresence(roomId: string, userId: string, input: { speaking: boolean; muted: boolean; deafened?: boolean }) { const room = this.rooms.get(roomId); const member = room?.members.get(userId); if (!member) return null; member.speaking = input.speaking; member.muted = input.muted; member.deafened = input.deafened ?? member.deafened; return this.getSnapshot(roomId); }
  setMode(roomId: string, mode: RoomMode) { const room = this.rooms.get(roomId); if (!room) return null; room.mode = mode; return room.mode; }
  updateSettings(roomId: string, settings: RoomSettings) { const room = this.rooms.get(roomId); if (!room) return null; room.settings = settings; room.votes.clear(); return room.settings; }
  canControlMedia(roomId: string, userId: string) { const room = this.rooms.get(roomId); const member = room?.members.get(userId); if (!room || !member) return false; if (["OWNER", "HOST", "ADMIN"].includes(member.role)) return true; if (room.settings.mediaControl === "everyone") return member.role !== "GUEST"; return room.settings.mediaControl === "host-moderators" && ["MODERATOR", "DJ"].includes(member.role); }
  canAddToQueue(roomId: string, userId: string) { const room = this.rooms.get(roomId); const member = room?.members.get(userId); if (!room || !member) return false; if (["OWNER", "HOST", "ADMIN"].includes(member.role)) return true; if (room.settings.queueControl === "everyone") return true; return room.settings.queueControl === "members" && member.role !== "GUEST"; }
  startScreenShare(roomId: string, user: User) { const room = this.rooms.get(roomId); const member = room?.members.get(user.id); if (!room || !member || member.role === "GUEST") return { ok: false, message: "Você não tem permissão para compartilhar a tela." } as const; if (room.screenShare && room.screenShare.user.id !== user.id) return { ok: false, message: `${room.screenShare.user.displayName} já está compartilhando.` } as const; room.screenShare = { user, startedAt: new Date().toISOString() }; return { ok: true, state: room.screenShare } as const; }
  stopScreenShare(roomId: string, userId: string) { const room = this.rooms.get(roomId); if (!room || room.screenShare?.user.id !== userId) return false; room.screenShare = null; return true; }

  private rememberMedia(item: MediaItem) { const key = mediaKey(item); const existing = this.mediaCatalog.get(key); const canonical = { ...(existing ?? asMedia(item)), ...asMedia(item), id: existing?.id ?? `media-${crypto.randomUUID()}` }; this.mediaCatalog.set(key, canonical); return canonical; }
  findKnownMedia(roomId: string, query: string) { const room = this.rooms.get(roomId); if (!room) return []; const normalized = query.trim().toLocaleLowerCase("pt-BR"); return [...(this.libraries.get(room.groupId)?.values() ?? [])].filter((item) => `${item.title} ${item.creator ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 12); }

  addQueueItem(roomId: string, item: QueueItem) { const room = this.rooms.get(roomId); if (!room) return null; this.rememberMedia(item); if (!room.queue.some((candidate) => mediaKey(candidate) === mediaKey(item))) { room.queue.push({ ...item, status: "queued" }); this.bumpQueue(room); } return this.normalizeQueue(room); }
  removeQueueItem(roomId: string, itemId: string) { const room = this.rooms.get(roomId); if (!room) return null; const item = room.queue.find((candidate) => candidate.id === itemId); if (!item || mediaKey(item) === `${room.currentMedia.provider}:${room.currentMedia.mediaId}`) return this.normalizeQueue(room); room.queue = room.queue.filter((candidate) => candidate.id !== itemId); return this.bumpQueue(room); }
  moveQueueItem(roomId: string, itemId: string, toIndex: number, revision?: number) { const room = this.rooms.get(roomId); if (!room) return null; if (revision !== undefined && revision !== room.queueRevision) return { queue: this.normalizeQueue(room), revision: room.queueRevision, conflict: true }; const fromIndex = room.queue.findIndex((item) => item.id === itemId); if (fromIndex < 0) return { queue: this.normalizeQueue(room), revision: room.queueRevision, conflict: false }; const [item] = room.queue.splice(fromIndex, 1); room.queue.splice(Math.max(0, Math.min(toIndex, room.queue.length)), 0, item); return { queue: this.bumpQueue(room), revision: room.queueRevision, conflict: false }; }
  playNext(roomId: string, item: QueueItem, revision?: number) { const room = this.rooms.get(roomId); if (!room) return null; if (revision !== undefined && revision !== room.queueRevision) return { queue: this.normalizeQueue(room), revision: room.queueRevision, conflict: true }; this.rememberMedia(item); room.queue = room.queue.filter((candidate) => mediaKey(candidate) !== mediaKey(item)); const currentIndex = room.queue.findIndex((candidate) => mediaKey(candidate) === `${room.currentMedia.provider}:${room.currentMedia.mediaId}`); room.queue.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, { ...item, status: "queued" }); return { queue: this.bumpQueue(room), revision: room.queueRevision, conflict: false }; }
  clearQueue(roomId: string, revision?: number) { const room = this.rooms.get(roomId); if (!room) return null; if (revision !== undefined && revision !== room.queueRevision) return { queue: this.normalizeQueue(room), revision: room.queueRevision, conflict: true }; const currentKey = `${room.currentMedia.provider}:${room.currentMedia.mediaId}`; room.queue = room.queue.filter((item) => mediaKey(item) === currentKey); return { queue: this.bumpQueue(room), revision: room.queueRevision, conflict: false }; }

  private recordHistory(room: RoomRecord) { if (!room.currentItem || !room.currentMedia.mediaId) return; const key = mediaKey(room.currentItem); if (room.historyMediaKey === key) return; const media = this.rememberMedia(room.currentItem); room.history.push({ ...media, id: crypto.randomUUID(), startedBy: room.currentItem.addedBy, playedAt: new Date().toISOString() }); room.history = room.history.slice(-300); room.historyMediaKey = key; }
  private setCurrent(room: RoomRecord, item: QueueItem, controlledBy: string) { room.currentItem = item; room.historyMediaKey = null; room.mode = item.type === "audio" ? "jam" : "watch"; room.currentMedia = { mediaId: item.providerMediaId, provider: item.provider, type: item.type, title: item.title, thumbnail: item.thumbnail, mimeType: item.mimeType, metadata: item.metadata, state: "paused", position: 0, duration: item.duration ?? 235, playbackRate: 1, startedAt: null, updatedAt: Date.now(), controlledBy, revision: room.currentMedia.revision + 1 }; room.votes.clear(); this.normalizeQueue(room); }
  nextQueueItem(roomId: string, controlledBy?: string) { const room = this.rooms.get(roomId); if (!room || room.queue.length === 0) return null; const wasPlaying = room.currentMedia.state === "playing"; const currentIndex = room.queue.findIndex((item) => mediaKey(item) === `${room.currentMedia.provider}:${room.currentMedia.mediaId}`); const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0; const nextItem = room.queue[nextIndex]; if (!nextItem) return null; if (currentIndex >= 0) room.queue.splice(currentIndex, 1); this.setCurrent(room, nextItem, controlledBy ?? room.currentMedia.controlledBy); if (wasPlaying) this.updateMedia(roomId, controlledBy ?? room.currentMedia.controlledBy, "play", 0); this.bumpQueue(room); return { media: room.currentMedia, queue: this.normalizeQueue(room), history: room.history, revision: room.queueRevision }; }
  advanceQueue(roomId: string, expectedMediaId: string, controlledBy: string) { const room = this.rooms.get(roomId); if (!room || room.currentMedia.mediaId !== expectedMediaId || room.currentMedia.state === "ended") return { advanced: false as const }; this.recordHistory(room); if (!room.settings.autoplayNext) { const current = this.getEffectiveMedia(room.currentMedia); room.currentMedia = { ...current, state: "ended", position: current.duration, startedAt: null, updatedAt: Date.now(), controlledBy, revision: current.revision + 1 }; return { advanced: false as const, media: room.currentMedia }; } const next = this.nextQueueItem(roomId, controlledBy); if (!next) { const current = this.getEffectiveMedia(room.currentMedia); room.currentMedia = { ...current, state: "ended", position: current.duration, startedAt: null, updatedAt: Date.now(), controlledBy, revision: current.revision + 1 }; return { advanced: false as const, media: room.currentMedia }; } return { advanced: true as const, next, media: next.media }; }
  previousQueueItem(roomId: string) { const room = this.rooms.get(roomId); const previous = room?.history.at(-2) ?? room?.history.at(-1); if (!room || !previous) return null; const item: QueueItem = { ...previous, id: crypto.randomUUID(), addedBy: previous.startedBy, addedAt: new Date().toISOString() }; room.queue.unshift(item); this.setCurrent(room, item, previous.startedBy.id); this.bumpQueue(room); return { media: room.currentMedia, queue: this.normalizeQueue(room), history: room.history, revision: room.queueRevision }; }
  changeMedia(roomId: string, item: QueueItem) { const room = this.rooms.get(roomId); if (!room) return null; if (!room.queue.some((candidate) => mediaKey(candidate) === mediaKey(item))) { room.queue.unshift(item); this.bumpQueue(room); } this.rememberMedia(item); this.setCurrent(room, item, item.addedBy.id); return room.currentMedia; }
  updateMedia(roomId: string, userId: string, action: "play" | "pause" | "seek" | "rate", position?: number, input?: { mediaId?: string; revision?: number; playbackRate?: number }) { const room = this.rooms.get(roomId); if (!room) return null; if (input?.mediaId && input.mediaId !== room.currentMedia.mediaId) return null; if (input?.revision !== undefined && input.revision < room.currentMedia.revision) return null; const current = this.getEffectiveMedia(room.currentMedia); const nextPosition = Math.max(0, Math.min(position ?? current.position, current.duration)); const nextRate = action === "rate" ? Math.max(.25, Math.min(2, input?.playbackRate ?? current.playbackRate)) : current.playbackRate; const isPlaying = action === "play" || ((action === "seek" || action === "rate") && current.state === "playing"); room.currentMedia = { ...current, state: action === "pause" ? "paused" : isPlaying ? "playing" : current.state, position: nextPosition, playbackRate: nextRate, startedAt: isPlaying ? Date.now() : null, updatedAt: Date.now(), controlledBy: userId, revision: current.revision + 1 }; if (action === "play") this.recordHistory(room); return this.getEffectiveMedia(room.currentMedia); }
  voteSkip(roomId: string, userId: string) { const room = this.rooms.get(roomId); if (!room || !room.members.has(userId)) return null; if (!room.settings.skipVotingEnabled) return { count: 0, required: 0, votedBy: [], advanced: false, next: null }; room.votes.add(userId); const required = this.requiredVotes(room); const votedBy = [...room.votes]; if (room.votes.size < required) return { count: room.votes.size, required, votedBy, advanced: false, next: null }; this.recordHistory(room); const next = this.nextQueueItem(roomId, userId); return { count: 0, required, votedBy: [], advanced: Boolean(next), next }; }
  addMessage(roomId: string, user: User, body: string) { const room = this.rooms.get(roomId); if (!room) return null; const message: ChatMessage = { id: crypto.randomUUID(), roomId, user, body: body.trim(), createdAt: new Date().toISOString() }; room.messages.push(message); return message; }

  getMediaHub(roomId: string, userId: string, input: { query?: string; filter?: string; cursor?: number; limit?: number } = {}) {
    const room = this.rooms.get(roomId); if (!room) return null; const favoriteKeys = this.favorites.get(room.groupId) ?? new Set<string>(); const query = input.query?.trim().toLocaleLowerCase("pt-BR") ?? ""; const cursor = Math.max(0, input.cursor ?? 0); const limit = Math.min(60, Math.max(1, input.limit ?? 30));
    let library = [...(this.libraries.get(room.groupId)?.values() ?? [])].map((item) => ({ ...item, favorite: favoriteKeys.has(mediaKey(item)) }));
    if (query) library = library.filter((item) => `${item.title} ${item.creator ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));
    if (input.filter === "favorites") library = library.filter((item) => item.favorite);
    if (input.filter === "video" || input.filter === "audio") library = library.filter((item) => item.type === input.filter);
    if (input.filter === "youtube" || input.filter === "google-drive") library = library.filter((item) => item.provider === input.filter);
    library.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    const playlists = [...(this.playlists.get(room.groupId)?.values() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((playlist) => ({ ...playlist, itemCount: playlist.items.length, items: undefined }));
    return { library: library.slice(cursor, cursor + limit), libraryTotal: library.length, nextCursor: cursor + limit < library.length ? cursor + limit : null, favorites: library.filter((item) => item.favorite), recent: room.history.slice(-50).reverse(), playlists, continueWatching: [...(this.progress.get(userId)?.values() ?? [])].filter((entry) => entry.position > 10 && entry.position < (entry.item.duration ?? Infinity) - 10).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12) };
  }

  saveLibrary(roomId: string, user: User, item: MediaItem) { const room = this.rooms.get(roomId); if (!room) return null; const canonical = this.rememberMedia(item); const library = this.libraries.get(room.groupId) ?? new Map<string, HouseLibraryItem>(); const key = mediaKey(canonical); const saved = library.get(key) ?? { ...canonical, addedBy: actor(user), addedAt: new Date().toISOString(), favorite: this.favorites.get(room.groupId)?.has(key) ?? false }; library.set(key, saved); this.libraries.set(room.groupId, library); return saved; }
  removeLibrary(roomId: string, item: MediaItem) { const room = this.rooms.get(roomId); if (!room) return false; const key = mediaKey(item); this.favorites.get(room.groupId)?.delete(key); return this.libraries.get(room.groupId)?.delete(key) ?? false; }
  toggleFavorite(roomId: string, user: User, item: MediaItem) { const room = this.rooms.get(roomId); if (!room) return null; this.saveLibrary(roomId, user, item); const favorites = this.favorites.get(room.groupId) ?? new Set<string>(); const key = mediaKey(item); const active = !favorites.has(key); if (active) favorites.add(key); else favorites.delete(key); this.favorites.set(room.groupId, favorites); return { active }; }

  createPlaylist(roomId: string, user: User, name: string, description?: string) { const room = this.rooms.get(roomId); if (!room) return null; const timestamp = new Date().toISOString(); const playlist: PlaylistRecord = { id: crypto.randomUUID(), houseId: room.groupId, name: name.trim(), description: description?.trim() || undefined, createdBy: actor(user), createdAt: timestamp, updatedAt: timestamp, items: [] }; const playlists = this.playlists.get(room.groupId) ?? new Map<string, PlaylistRecord>(); playlists.set(playlist.id, playlist); this.playlists.set(room.groupId, playlists); return this.publicPlaylist(playlist, true); }
  private publicPlaylist(playlist: PlaylistRecord, includeItems: boolean): Playlist { return { ...playlist, itemCount: playlist.items.length, items: includeItems ? playlist.items : undefined }; }
  getPlaylist(roomId: string, playlistId: string) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); return playlist ? this.publicPlaylist(playlist, true) : null; }
  updatePlaylist(roomId: string, playlistId: string, input: { name: string; description?: string }) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); if (!playlist) return null; playlist.name = input.name.trim(); playlist.description = input.description?.trim() || undefined; playlist.updatedAt = new Date().toISOString(); return this.publicPlaylist(playlist, true); }
  deletePlaylist(roomId: string, playlistId: string) { const room = this.rooms.get(roomId); return room ? this.playlists.get(room.groupId)?.delete(playlistId) ?? false : false; }
  addPlaylistItem(roomId: string, playlistId: string, user: User, item: MediaItem) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); if (!playlist) return null; const canonical = this.rememberMedia(item); if (!playlist.items.some((entry) => mediaKey(entry) === mediaKey(canonical))) playlist.items.push({ ...canonical, itemId: crypto.randomUUID(), position: playlist.items.length, addedBy: actor(user), addedAt: new Date().toISOString() }); playlist.updatedAt = new Date().toISOString(); return this.publicPlaylist(playlist, true); }
  removePlaylistItem(roomId: string, playlistId: string, itemId: string) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); if (!playlist) return null; playlist.items = playlist.items.filter((item) => item.itemId !== itemId).map((item, position) => ({ ...item, position })); playlist.updatedAt = new Date().toISOString(); return this.publicPlaylist(playlist, true); }
  reorderPlaylist(roomId: string, playlistId: string, itemIds: string[]) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); if (!playlist || itemIds.length !== playlist.items.length || new Set(itemIds).size !== itemIds.length) return null; const byId = new Map(playlist.items.map((item) => [item.itemId, item])); if (itemIds.some((id) => !byId.has(id))) return null; playlist.items = itemIds.map((id, position) => ({ ...byId.get(id)!, position })); playlist.updatedAt = new Date().toISOString(); return this.publicPlaylist(playlist, true); }
  enqueuePlaylist(roomId: string, playlistId: string, user: User, mode: "append" | "next" | "replace", playNow: boolean) { const room = this.rooms.get(roomId); const playlist = room && this.playlists.get(room.groupId)?.get(playlistId); if (!room || !playlist || !playlist.items.length) return null; const items: QueueItem[] = playlist.items.map((item) => ({ ...item, id: crypto.randomUUID(), addedBy: actor(user), addedAt: new Date().toISOString(), status: "queued" })); const incomingKeys = new Set(items.map(mediaKey)); const existing = room.queue.filter((item) => !incomingKeys.has(mediaKey(item))); const currentIndex = existing.findIndex((item) => mediaKey(item) === `${room.currentMedia.provider}:${room.currentMedia.mediaId}`); if (mode === "replace") room.queue = room.currentMedia.mediaId && !playNow && currentIndex >= 0 ? [existing[currentIndex], ...items] : items; else if (mode === "next" || playNow) { const index = currentIndex >= 0 && !playNow ? currentIndex + 1 : 0; room.queue = [...existing.slice(0, index), ...items, ...existing.slice(index)]; } else room.queue = [...existing, ...items]; if (playNow) { this.setCurrent(room, items[0], user.id); this.updateMedia(roomId, user.id, "play", 0); } this.bumpQueue(room); return { playlist: this.publicPlaylist(playlist, true), queue: this.normalizeQueue(room), media: playNow ? room.currentMedia : null, revision: room.queueRevision }; }

  saveProgress(userId: string, item: QueueItem, position: number) { const entries = this.progress.get(userId) ?? new Map<string, { item: QueueItem; position: number; updatedAt: string }>(); entries.set(mediaKey(item), { item, position: Math.max(0, position), updatedAt: new Date().toISOString() }); this.progress.set(userId, entries); }
  getEffectiveMedia(media: MediaState): MediaState { if (media.state !== "playing" || media.startedAt === null) return media; const now = Date.now(); const elapsed = (now - media.startedAt) / 1000; return { ...media, position: Math.min(media.duration, media.position + elapsed * media.playbackRate), startedAt: now }; }
}
