import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { AuthStore } from "./authStore.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaSocialRepository } from "./prismaSocialRepository.js";
import { SocialStore } from "./socialStore.js";

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
