import test from "node:test";
import assert from "node:assert/strict";
import { RoomStore } from "./store.js";

test("room store keeps media position authoritative", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  store.addMember("cinema", user);
  store.changeMedia("cinema", { id: "q1", provider: "youtube", providerMediaId: "abc", type: "video", title: "Test", duration: 120, addedBy: user, addedAt: new Date().toISOString() });
  const playing = store.updateMedia("cinema", user.id, "play", 12);
  assert.equal(playing?.state, "playing");
  assert.equal(playing?.position, 12);
  const paused = store.updateMedia("cinema", user.id, "pause");
  assert.equal(paused?.state, "paused");
  assert.ok((paused?.position ?? 0) >= 12);
});

test("authoritative snapshots rebase the playback clock instead of counting elapsed time twice", () => {
  const store = new RoomStore();
  const room = store.getRoom("cinema")!;
  room.currentMedia = { ...room.currentMedia, mediaId: "clock", provider: "youtube", state: "playing", position: 5, duration: 120, playbackRate: 1, startedAt: Date.now() - 10_000, revision: 3 };
  const snapshot = store.getSnapshot("cinema")!.currentMedia;
  assert.ok(snapshot.position >= 14.5 && snapshot.position <= 15.5);
  assert.ok(snapshot.startedAt !== null && Date.now() - snapshot.startedAt < 100);
});

test("starts as one empty Party and infers presentation mode from media", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const groups = store.listGroups();
  assert.equal(groups[0]?.rooms.length, 1);
  assert.equal(groups[0]?.rooms[0]?.name, "Party");
  assert.equal(store.getSnapshot("cinema")?.queue.length, 0);
  assert.equal(store.getSnapshot("cinema")?.currentMedia.state, "idle");
  store.changeMedia("cinema", { id: "audio", provider: "google-drive", providerMediaId: "song", type: "audio", title: "Song", duration: 120, addedBy: user, addedAt: new Date().toISOString() });
  assert.equal(store.getSnapshot("cinema")?.mode, "jam");
});

test("queue rejects accidental duplicates", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const item = {
    id: "q1",
    provider: "youtube" as const,
    providerMediaId: "abc",
    type: "video" as const,
    title: "Test video",
    addedBy: user,
    addedAt: new Date().toISOString(),
  };
  const first = store.addQueueItem("cinema", item);
  const second = store.addQueueItem("cinema", { ...item, id: "q2" });
  assert.equal(first?.length, second?.length);
});

test("mode and history are session state once playback really starts", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  store.addMember("cinema", user);
  const first = { id: "q1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First", duration: 100, addedBy: user, addedAt: new Date().toISOString() };
  const second = { id: "q2", provider: "youtube" as const, providerMediaId: "second", type: "video" as const, title: "Second", duration: 100, addedBy: user, addedAt: new Date().toISOString() };
  store.addQueueItem("cinema", first); store.addQueueItem("cinema", second);
  store.changeMedia("cinema", first); store.updateMedia("cinema", user.id, "play", 0); store.changeMedia("cinema", second); store.updateMedia("cinema", user.id, "play", 0);
  store.setMode("cinema", "jam");
  const snapshot = store.getSnapshot("cinema");
  assert.equal(snapshot?.mode, "jam");
  assert.equal(snapshot?.history.length, 2);
  const previous = store.previousQueueItem("cinema");
  assert.equal(previous?.media.mediaId, "first");
});

test("skip vote advances only after the configured threshold", () => {
  const store = new RoomStore();
  const duck = { id: "u1", displayName: "Duck", color: "#fff" };
  const maria = { id: "u2", displayName: "Maria", color: "#eee" };
  store.addMember("cinema", duck); store.addMember("cinema", maria);
  const item = { id: "q1", provider: "youtube" as const, providerMediaId: "skip-me", type: "video" as const, title: "Skip me", addedBy: duck, addedAt: new Date().toISOString() };
  const next = { ...item, id: "q2", providerMediaId: "next", title: "Next" };
  store.addQueueItem("cinema", item); store.addQueueItem("cinema", next); store.changeMedia("cinema", item);
  const firstVote = store.voteSkip("cinema", duck.id);
  assert.equal(firstVote?.advanced, false);
  const secondVote = store.voteSkip("cinema", maria.id);
  assert.equal(secondVote?.advanced, true);
});

test("mixed-provider queue treats provider and media id as a compound identity", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const base = { id: "q1", providerMediaId: "shared-id", type: "video" as const, title: "Media", addedBy: user, addedAt: new Date().toISOString() };
  store.addQueueItem("cinema", { ...base, provider: "youtube" });
  const queue = store.addQueueItem("cinema", { ...base, id: "q2", provider: "google-drive", mimeType: "video/mp4" });
  assert.equal(queue?.filter((item) => item.providerMediaId === "shared-id").length, 2);
});

test("room settings are authoritative for media and queue permissions", () => {
  const store = new RoomStore();
  const host = { id: "host", displayName: "Host", color: "#fff" };
  const guest = { id: "guest", displayName: "Guest", color: "#eee" };
  store.addMember("cinema", host);
  store.addMember("cinema", guest, "GUEST");
  store.updateSettings("cinema", { mediaControl: "host", queueControl: "members", skipVotingEnabled: true, skipVoteThreshold: 50, autoplayNext: true });
  assert.equal(store.canControlMedia("cinema", host.id), true);
  assert.equal(store.canControlMedia("cinema", guest.id), false);
  assert.equal(store.canAddToQueue("cinema", guest.id), false);
});

test("media hub stores explicit house library, shared favorites and sparse progress checkpoints", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const item = { id: "q1", provider: "youtube" as const, providerMediaId: "movie", type: "video" as const, title: "Movie", duration: 300, addedBy: user, addedAt: new Date().toISOString() };
  store.saveLibrary("cinema", user, item);
  store.toggleFavorite("cinema", user, item);
  store.saveProgress(user.id, item, 120);
  const hub = store.getMediaHub("cinema", user.id);
  assert.equal(hub?.library[0]?.providerMediaId, "movie");
  assert.equal(hub?.favorites[0]?.providerMediaId, "movie");
  assert.equal(hub?.continueWatching[0]?.position, 120);
});

test("playlist ordering survives reads and can be inserted into the queue", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const playlist = store.createPlaylist("cinema", user, "Noite de Rock")!;
  const first = { id: "m1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First" };
  const second = { id: "m2", provider: "youtube" as const, providerMediaId: "second", type: "video" as const, title: "Second" };
  store.addPlaylistItem("cinema", playlist.id, user, first);
  const withItems = store.addPlaylistItem("cinema", playlist.id, user, second)!;
  store.reorderPlaylist("cinema", playlist.id, [withItems.items![1].itemId, withItems.items![0].itemId]);
  const ordered = store.getPlaylist("cinema", playlist.id)!;
  assert.deepEqual(ordered.items?.map((item) => item.title), ["Second", "First"]);
  const queued = store.enqueuePlaylist("cinema", playlist.id, user, "append", false)!;
  assert.deepEqual(queued.queue.map((item) => item.title), ["Second", "First"]);
});

test("queue revision rejects a stale reorder without losing items", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const first = { id: "q1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First", addedBy: user, addedAt: new Date().toISOString() };
  const second = { ...first, id: "q2", providerMediaId: "second", title: "Second" };
  store.addQueueItem("cinema", first); const revision = store.getQueueRevision("cinema"); store.addQueueItem("cinema", second);
  const result = store.moveQueueItem("cinema", first.id, 1, revision)!;
  assert.equal(result.conflict, true);
  assert.deepEqual(result.queue.map((item) => item.title), ["First", "Second"]);
});

test("ended events are idempotent for the same current media", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const first = { id: "q1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First", addedBy: user, addedAt: new Date().toISOString() };
  const second = { ...first, id: "q2", providerMediaId: "second", title: "Second" };
  store.addQueueItem("cinema", first); store.addQueueItem("cinema", second); store.changeMedia("cinema", first); store.updateMedia("cinema", user.id, "play", 0);
  assert.equal(store.advanceQueue("cinema", "first", user.id).advanced, true);
  assert.equal(store.advanceQueue("cinema", "first", user.id).advanced, false);
  assert.equal(store.getSnapshot("cinema")?.currentMedia.mediaId, "second");
});

test("playback revision rejects stale commands and commands for another media", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const item = { id: "q1", provider: "youtube" as const, providerMediaId: "current", type: "video" as const, title: "Current", duration: 200, addedBy: user, addedAt: new Date().toISOString() };
  store.addQueueItem("cinema", item); store.changeMedia("cinema", item);
  const before = store.getSnapshot("cinema")!.currentMedia;
  const playing = store.updateMedia("cinema", user.id, "play", 10, { mediaId: "current", revision: before.revision });
  assert.ok(playing && playing.revision > before.revision);
  assert.equal(store.updateMedia("cinema", user.id, "seek", 150, { mediaId: "current", revision: before.revision }), null);
  assert.equal(store.updateMedia("cinema", user.id, "seek", 150, { mediaId: "old-media", revision: playing!.revision }), null);
  assert.ok((store.getSnapshot("cinema")?.currentMedia.position ?? 0) < 20);
});

test("house autoplay off ends current media and keeps the next item queued", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const first = { id: "q1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First", duration: 100, addedBy: user, addedAt: new Date().toISOString() };
  const second = { ...first, id: "q2", providerMediaId: "second", title: "Second" };
  store.addQueueItem("cinema", first); store.addQueueItem("cinema", second); store.changeMedia("cinema", first); store.updateMedia("cinema", user.id, "play", 0);
  store.updateSettings("cinema", { ...store.getSnapshot("cinema")!.settings, autoplayNext: false });
  const result = store.advanceQueue("cinema", "first", user.id);
  assert.equal(result.advanced, false);
  assert.equal(store.getSnapshot("cinema")?.currentMedia.state, "ended");
  assert.deepEqual(store.getSnapshot("cinema")?.queue.map((item) => item.providerMediaId), ["first", "second"]);
});

test("house autoplay on advances exactly once", () => {
  const store = new RoomStore();
  const user = { id: "u1", displayName: "Duck", color: "#fff" };
  const first = { id: "q1", provider: "youtube" as const, providerMediaId: "first", type: "video" as const, title: "First", duration: 100, addedBy: user, addedAt: new Date().toISOString() };
  const second = { ...first, id: "q2", providerMediaId: "second", title: "Second" };
  store.addQueueItem("cinema", first); store.addQueueItem("cinema", second); store.changeMedia("cinema", first); store.updateMedia("cinema", user.id, "play", 0);
  assert.equal(store.advanceQueue("cinema", "first", user.id).advanced, true);
  assert.equal(store.advanceQueue("cinema", "first", user.id).advanced, false);
  assert.equal(store.getSnapshot("cinema")?.currentMedia.mediaId, "second");
});

test("screen sharing allows one non-guest at a time and clears when they leave", () => {
  const store = new RoomStore();
  const host = { id: "host", displayName: "Host", color: "#fff" };
  const member = { id: "member", displayName: "Member", color: "#ddd" };
  const guest = { id: "guest", displayName: "Guest", color: "#aaa" };
  store.addMember("cinema", host); store.addMember("cinema", member); store.addMember("cinema", guest, "GUEST");
  assert.equal(store.startScreenShare("cinema", guest).ok, false);
  assert.equal(store.startScreenShare("cinema", host).ok, true);
  assert.equal(store.startScreenShare("cinema", member).ok, false);
  store.removeMember("cinema", host.id);
  assert.equal(store.getSnapshot("cinema")?.screenShare, null);
});
