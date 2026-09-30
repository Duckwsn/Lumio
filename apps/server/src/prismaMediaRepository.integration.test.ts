import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import type { QueueItem } from "@lumio/shared";
import { AuthStore } from "./authStore.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaMediaRepository } from "./prismaMediaRepository.js";
import { PrismaSocialRepository } from "./prismaSocialRepository.js";
import { RoomStore } from "./store.js";
import { SocialStore } from "./socialStore.js";

const url = process.env.LUMIO_TEST_DATABASE_URL;
test("PostgreSQL queue, library, favorites, playlist, history and progress survive restart", { skip: !url }, async () => {
  if (!url || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Use an isolated lumio_test database.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  let userId = "", houseId = "";
  const providerMediaId = `test-${crypto.randomUUID()}`;
  try {
    await db.$connect();
    const auth = new AuthStore(null);
    const user = auth.createLocal("Media Test", `${crypto.randomUUID()}@example.test`, "passw0rd-safe"); userId = user.id;
    await new PrismaAuthRepository(db, auth).saveUser(user.id);
    const social = new SocialStore(); const house = social.createHouse(user, "Casa Media"); houseId = house.id;
    await new PrismaSocialRepository(db, social, (id) => auth.getUser(id)).saveHouse(house.id);
    const store = new RoomStore(); store.addHouseRoom({ houseId, houseName: house.name, roomId: house.primaryRoomId });
    const media = { id: crypto.randomUUID(), provider: "youtube" as const, providerMediaId, type: "video" as const, title: "Persisted clip", duration: 120 };
    const item: QueueItem = { ...media, addedBy: { id: user.id, displayName: user.displayName, color: user.color }, addedAt: new Date().toISOString() };
    store.addQueueItem(house.primaryRoomId, item);
    assert.equal(store.getQueueRevision(house.primaryRoomId), 1, "adding one occurrence changes the queue once");
    store.addQueueItem(house.primaryRoomId, item);
    assert.equal(store.getQueueRevision(house.primaryRoomId), 1, "retrying the same occurrence is a no-op");
    store.saveLibrary(house.primaryRoomId, user, media);
    store.toggleFavorite(house.primaryRoomId, user, media);
    const playlist = store.createPlaylist(house.primaryRoomId, user, "Favorites")!;
    store.addPlaylistItem(house.primaryRoomId, playlist.id, user, media);
    store.changeMedia(house.primaryRoomId, store.getRoom(house.primaryRoomId)!.queue[0]);
    assert.equal(store.getQueueRevision(house.primaryRoomId), 2, "selecting the current occurrence changes the queue order/status");
    store.updateMedia(house.primaryRoomId, user.id, "play", 0);
    store.saveProgress(user.id, item, 45);
    const repository = new PrismaMediaRepository(db, store, (id) => auth.getUser(id));
    await repository.saveHouse(house.primaryRoomId);
    await repository.saveProgress(user.id, item, 45);
    const persistedRoom = await db.room.findUniqueOrThrow({ where: { id: house.primaryRoomId }, select: { queueRevision: true } });
    const persistedQueue = await db.queueItem.findMany({ where: { roomId: house.primaryRoomId }, orderBy: { position: "asc" }, select: { id: true, provider: true, providerMediaId: true, position: true } });
    assert.equal(persistedRoom.queueRevision, 2);
    assert.deepEqual(persistedQueue, [{ id: item.id, provider: item.provider, providerMediaId, position: 0 }], "PostgreSQL contains one occurrence, not two");

    const restored = new RoomStore(); restored.addHouseRoom({ houseId, houseName: house.name, roomId: house.primaryRoomId });
    const restoredRepository = new PrismaMediaRepository(db, restored, (id) => auth.getUser(id));
    await restoredRepository.load();
    const snapshot = restored.getSnapshot(house.primaryRoomId)!;
    assert.equal(snapshot.queue.length, 1);
    assert.equal(snapshot.queue[0]?.id, item.id);
    assert.equal(snapshot.queueRevision, persistedRoom.queueRevision, "restore retains the authoritative queue revision");
    assert.equal(snapshot.currentMedia.state, "idle");
    assert.equal(snapshot.history.length, 1);
    const hub = restored.getMediaHub(house.primaryRoomId, user.id)!;
    assert.equal(hub.library.length, 1);
    assert.equal(hub.favorites.length, 1);
    assert.equal(hub.playlists.length, 1);
    assert.equal(restored.getPlaylist(house.primaryRoomId, playlist.id)?.items?.length, 1);
    assert.equal(hub.continueWatching.length, 1);

    restored.addQueueItem(house.primaryRoomId, item);
    assert.equal(restored.getQueueRevision(house.primaryRoomId), 2, "retry after restart does not create another occurrence");
    const repeated: QueueItem = { ...item, id: crypto.randomUUID() };
    restored.addQueueItem(house.primaryRoomId, repeated);
    assert.equal(restored.getQueueRevision(house.primaryRoomId), 3, "a new occurrence of the same media is intentional");
    await restoredRepository.saveHouse(house.primaryRoomId);
    const repeatedRows = await db.queueItem.findMany({ where: { roomId: house.primaryRoomId }, orderBy: { position: "asc" }, select: { id: true, providerMediaId: true, position: true } });
    assert.deepEqual(repeatedRows, [
      { id: item.id, providerMediaId, position: 0 },
      { id: repeated.id, providerMediaId, position: 1 },
    ]);
    const restartedAgain = new RoomStore(); restartedAgain.addHouseRoom({ houseId, houseName: house.name, roomId: house.primaryRoomId });
    await new PrismaMediaRepository(db, restartedAgain, (id) => auth.getUser(id)).load();
    assert.deepEqual(restartedAgain.getSnapshot(house.primaryRoomId)?.queue.map((entry) => entry.id), [item.id, repeated.id]);
    assert.equal(restartedAgain.getQueueRevision(house.primaryRoomId), 3);
  } finally {
    if (houseId) await db.group.deleteMany({ where: { id: houseId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.mediaItem.deleteMany({ where: { provider: "youtube", providerMediaId } });
    await db.$disconnect();
  }
});
