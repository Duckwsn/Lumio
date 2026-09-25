import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { AuthStore } from "./authStore.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";

const url = process.env.LUMIO_TEST_DATABASE_URL;
test("PostgreSQL auth survives adapter restart without local files", { skip: !url }, async () => {
  if (!url || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Use an isolated lumio_test database.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  let userId = "";
  try {
    await db.$connect();
    const first = new AuthStore(null);
    const adapter = new PrismaAuthRepository(db, first);
    const user = first.createLocal("Persistência", `${crypto.randomUUID()}@example.test`, "passw0rd-safe");
    userId = user.id;
    const verification = first.issueToken(user.id, "EMAIL_VERIFICATION", 60_000, 0)!;
    await adapter.saveUser(user.id);

    const second = new AuthStore(null);
    const restored = new PrismaAuthRepository(db, second);
    await restored.load();
    assert.equal(second.login(user.email!, "passw0rd-safe")?.id, user.id);
    assert.equal(second.consumeVerification(verification), true);
    const session = second.createSession(user.id);
    await restored.saveUser(user.id);

    const third = new AuthStore(null);
    const restarted = new PrismaAuthRepository(db, third);
    await restarted.load();
    assert.equal(third.resolveSession(session)?.user.id, user.id);
    third.revokeSession(session);
    await restarted.saveUser(user.id);

    const fourth = new AuthStore(null);
    await new PrismaAuthRepository(db, fourth).load();
    assert.equal(fourth.resolveSession(session), undefined);
  } finally {
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
});
