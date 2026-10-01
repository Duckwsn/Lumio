import test from "node:test";
import assert from "node:assert/strict";
import { MediaViewerRegistry } from "./mediaViewerRegistry.js";
import { RoomStore } from "./store.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("GX3 viewer identity is per socket; duplicate enter/leave and handoff do not pause", async () => {
  const paused: string[] = [];
  const registry = new MediaViewerRegistry((roomId) => { paused.push(roomId); }, 20);
  registry.enter("cinema", "same-user-tab-a");
  registry.enter("cinema", "same-user-tab-a");
  registry.enter("cinema", "same-user-tab-b");
  assert.equal(registry.count("cinema"), 2);
  registry.leave("cinema", "same-user-tab-a");
  registry.leave("cinema", "same-user-tab-a");
  assert.equal(registry.count("cinema"), 1);
  await delay(35);
  assert.deepEqual(paused, []);
  registry.leave("cinema", "same-user-tab-b");
  registry.enter("cinema", "new-socket-after-reconnect");
  await delay(35);
  assert.deepEqual(paused, []);
  registry.leave("cinema", "new-socket-after-reconnect");
  await delay(35);
  assert.deepEqual(paused, ["cinema"]);
  registry.clearAll();
});

test("GX3 zero-viewer CAS pauses once without changing queue, current item, history or autoplay", () => {
  const store = new RoomStore();
  const user = { id: "host", displayName: "Host", color: "#fff" };
  const item = { id: "one-occurrence", provider: "youtube" as const, providerMediaId: "abcdefghijk", type: "video" as const, title: "One", addedBy: user, addedAt: new Date().toISOString() };
  store.addQueueItem("cinema", item);
  store.changeMedia("cinema", item);
  store.updateMedia("cinema", user.id, "play", 15);
  const before = store.getSnapshot("cinema")!;
  const marker = { mediaId: before.currentMedia.mediaId, revision: before.currentMedia.revision, queueItemId: store.getRoom("cinema")!.currentItem!.id };
  const pause = store.pauseIfCurrent("cinema", marker);
  assert.equal(pause?.state, "paused");
  assert.equal(pause?.revision, marker.revision + 1);
  assert.equal(store.pauseIfCurrent("cinema", marker), null);
  const after = store.getSnapshot("cinema")!;
  assert.deepEqual(after.queue, before.queue);
  assert.equal(after.queueRevision, before.queueRevision);
  assert.deepEqual(after.history, before.history);
  assert.equal(store.getRoom("cinema")?.currentItem?.id, item.id);
  assert.deepEqual(after.settings, before.settings);
  assert.equal(store.pauseIfCurrent("cinema", { ...marker, revision: after.currentMedia.revision }), null);
});

test("GX3 stale zero-viewer marker cannot pause a newer media occurrence", () => {
  const store = new RoomStore();
  const user = { id: "host", displayName: "Host", color: "#fff" };
  const item = (id: string) => ({ id, provider: "youtube" as const, providerMediaId: id, type: "video" as const, title: id, addedBy: user, addedAt: new Date().toISOString() });
  for (const id of ["first", "second"]) store.addQueueItem("cinema", item(id));
  store.changeMedia("cinema", item("first"));
  store.updateMedia("cinema", user.id, "play", 0);
  const current = store.getSnapshot("cinema")!;
  const stale = { mediaId: current.currentMedia.mediaId, revision: current.currentMedia.revision, queueItemId: store.getRoom("cinema")!.currentItem!.id };
  store.changeMedia("cinema", item("second"));
  store.updateMedia("cinema", user.id, "play", 0);
  assert.equal(store.pauseIfCurrent("cinema", stale), null);
  assert.equal(store.getSnapshot("cinema")?.currentMedia.state, "playing");
});
