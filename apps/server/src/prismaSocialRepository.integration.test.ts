import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { AuthStore } from "./authStore.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaSocialRepository } from "./prismaSocialRepository.js";
import { SocialStore } from "./socialStore.js";
import { RoomStore } from "./store.js";
import { PrismaMediaRepository } from "./prismaMediaRepository.js";

const url = process.env.LUMIO_TEST_DATABASE_URL;
test("PostgreSQL House, membership and hashed invite survive restart; presence does not", { skip: !url }, async () => {
  if (!url || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Use an isolated lumio_test database.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users: string[] = [];
  let houseId = "";
  try {
    await db.$connect();
    const auth = new AuthStore(null);
    const authRepo = new PrismaAuthRepository(db, auth);
    const host = auth.createLocal("Host", `${crypto.randomUUID()}@example.test`, "passw0rd-safe");
    const guest = auth.createLocal("Guest", `${crypto.randomUUID()}@example.test`, "passw0rd-safe");
    users.push(host.id, guest.id);
    await authRepo.saveUser(host.id); await authRepo.saveUser(guest.id);
    const social = new SocialStore();
    const socialRepo = new PrismaSocialRepository(db, social, (id) => auth.getUser(id));
    const house = social.createHouse(host, "Casa Persistida"); houseId = house.id;
    await socialRepo.saveHouse(house.id);
    const invite = social.createInvite(house.id, host, { expiresInHours: 24, maxUses: 1 });
    assert.ok(invite);
    await socialRepo.saveHouse(house.id);
    assert.equal(social.acceptInvite(invite.token, guest).ok, true);
    social.setPresence(house.id, guest.id, "ONLINE", { inParty: true, inCall: true });
    await socialRepo.saveHouse(house.id);

    const authRestarted = new AuthStore(null);
    await new PrismaAuthRepository(db, authRestarted).load();
    const restored = new SocialStore();
    await new PrismaSocialRepository(db, restored, (id) => authRestarted.getUser(id)).load();
    const details = restored.details(house.id, host.id)!;
    assert.equal(details.members.length, 2);
    assert.equal(details.members.find((entry) => entry.user.id === guest.id)?.presence, "OFFLINE");
    assert.equal(details.members.find((entry) => entry.user.id === guest.id)?.inParty, false);
    assert.equal(restored.inspectInvite(invite.token).status, "LIMIT_REACHED");
    assert.equal(restored.acceptInvite(invite.token, guest).ok, true);
  } finally {
    if (houseId) await db.group.deleteMany({ where: { id: houseId } });
    if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});

test("PostgreSQL House deletion cascades owned data but preserves user, Drive connection and another House", { skip: !url }, async () => {
  if (!url || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Use an isolated lumio_test database.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  let userId = "", deletedId = "", keptId = "";
  const providerMediaId = `test-${crypto.randomUUID()}`;
  try {
    await db.$connect();
    const auth = new AuthStore(null);
    const host = auth.createLocal("Delete Test", `${crypto.randomUUID()}@example.test`, "passw0rd-safe"); userId = host.id;
    await new PrismaAuthRepository(db, auth).saveUser(userId);
    await db.googleDriveConnection.create({ data: { userId, scopes: "drive.readonly", encryptedCredentials: "test-ciphertext" } });
    const social = new SocialStore();
    const deleted = social.createHouse(host, "To Delete"), kept = social.createHouse(host, "To Keep");
    deletedId = deleted.id; keptId = kept.id;
    const socialRepo = new PrismaSocialRepository(db, social, (id) => auth.getUser(id));
    await socialRepo.saveHouse(deleted.id); await socialRepo.saveHouse(kept.id);
    const invite = social.createInvite(deleted.id, host, { expiresInHours: 24, maxUses: 2 })!;
    await socialRepo.saveHouse(deleted.id);
    const store = new RoomStore();
    for (const house of [deleted, kept]) store.addHouseRoom({ houseId: house.id, houseName: house.name, roomId: house.primaryRoomId });
    const media = { id: crypto.randomUUID(), provider: "youtube" as const, providerMediaId, type: "video" as const, title: "Shared clip", duration: 100 };
    for (const house of [deleted, kept]) {
      store.addQueueItem(house.primaryRoomId, { ...media, id: crypto.randomUUID(), addedBy: host, addedAt: new Date().toISOString() });
      store.saveLibrary(house.primaryRoomId, host, media);
      store.toggleFavorite(house.primaryRoomId, host, media);
      const playlist = store.createPlaylist(house.primaryRoomId, host, "Test")!;
      store.addPlaylistItem(house.primaryRoomId, playlist.id, host, media);
    }
    const mediaRepo = new PrismaMediaRepository(db, store, (id) => auth.getUser(id));
    await mediaRepo.saveHouse(deleted.primaryRoomId); await mediaRepo.saveHouse(kept.primaryRoomId);
    assert.equal(await socialRepo.deleteHouse(deleted.id, "someone-else"), "FORBIDDEN");
    assert.equal(await socialRepo.deleteHouse(deleted.id, userId), "DELETED");
    assert.equal(await socialRepo.deleteHouse(deleted.id, userId), "NOT_FOUND");
    assert.equal(await db.group.count({ where: { id: deleted.id } }), 0);
    assert.equal(await db.room.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.groupMember.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.houseInvite.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.queueItem.count({ where: { roomId: deleted.primaryRoomId } }), 0);
    assert.equal(await db.groupLibraryItem.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.houseFavorite.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.playlist.count({ where: { groupId: deleted.id } }), 0);
    assert.equal(await db.group.count({ where: { id: kept.id } }), 1);
    assert.equal(await db.queueItem.count({ where: { roomId: kept.primaryRoomId } }), 1);
    assert.equal(await db.mediaItem.count({ where: { provider: media.provider, providerMediaId: media.providerMediaId } }), 1);
    assert.equal(await db.user.count({ where: { id: userId } }), 1);
    assert.equal(await db.googleDriveConnection.count({ where: { userId } }), 1);
    social.deleteHouse(deleted.id); store.deleteHouse(deleted.id);
    assert.equal(social.inspectInvite(invite.token).status, "INVALID");
    assert.equal(store.getSnapshot(deleted.primaryRoomId), null);
  } finally {
    if (deletedId) await db.group.deleteMany({ where: { id: deletedId } });
    if (keptId) await db.group.deleteMany({ where: { id: keptId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.mediaItem.deleteMany({ where: { provider: "youtube", providerMediaId } });
    await db.$disconnect();
  }
});
