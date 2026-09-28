import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { AuthStore } from "./authStore.js";
import { PrismaAuthRepository } from "./prismaAuthRepository.js";
import { PrismaSocialRepository } from "./prismaSocialRepository.js";
import { SocialStore } from "./socialStore.js";
import { RoomStore } from "./store.js";
import { PrismaMediaRepository } from "./prismaMediaRepository.js";

// Explicit opt-in: this suite briefly inserts intentionally invalid fixtures.
// Run alone against a disposable local database, never concurrent with suites
// that read every persisted record and never against an existing developer DB.
const url = process.env.LUMIO_TEST_DATABASE_URL;
test("compiled production bootstrap restores legacy NULL-code invites and reports fail-fast stages safely", { skip: process.env.LUMIO_BOOT_QA !== "1", timeout: 90_000 }, async () => {
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("/lumio_test")) throw new Error("Requires disposable loopback lumio_test database.");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const port = await new Promise<number>((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); }); });
  const base = `http://127.0.0.1:${port}`;
  const key = Buffer.alloc(32, 7);
  const encrypt = () => {
    const cipher = crypto.createCipheriv("aes-256-gcm", key, Buffer.alloc(12, 3));
    const data = Buffer.concat([cipher.update(JSON.stringify({ accessToken: "qa-access-only", refreshToken: "qa-refresh-only", expiresAt: Date.now() + 60000, scope: "https://www.googleapis.com/auth/drive.readonly" })), cipher.final()]);
    return JSON.stringify({ iv: Buffer.alloc(12, 3).toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
  };
  let child: ChildProcess | undefined;
  let logs = "";
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await exited;
    }
    child = undefined;
  };
  const start = async (failureStage?: string) => {
    logs = "";
    child = spawn(process.execPath, [path.resolve("dist/index.js")], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production", LUMIO_PRODUCTION_SMOKE: "1", PERSISTENCE_MODE: "postgres", DATABASE_URL: url,
        PORT: String(port), CLIENT_ORIGIN: "https://app.example.test", APP_PUBLIC_URL: "https://app.example.test", API_PUBLIC_URL: "https://api.example.test",
        EMAIL_PROVIDER: "resend", EMAIL_FROM: "QA <qa@example.test>", RESEND_API_KEY: "qa-resend-only", AUTH_SIGNUP_MODE: "google-only",
        GOOGLE_CLIENT_ID: "qa-client-only", GOOGLE_CLIENT_SECRET: "qa-secret-only", GOOGLE_REDIRECT_URI: "https://api.example.test/api/google-drive/oauth/callback", GOOGLE_TOKEN_ENCRYPTION_KEY: key.toString("hex"),
        YOUTUBE_API_KEY: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "" },
    });
    for (const output of [child.stdout, child.stderr]) output?.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try { if ((await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(100);
    }
    if (failureStage) {
      assert.equal(ready, false);
      assert.equal(child.exitCode, 1);
      const entry = logs.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line)).find((item) => item.event === "server_boot_failed");
      assert.ok(entry); assert.equal(entry.bootStage, failureStage);
      assert.ok(entry.errorName); assert.ok(entry.errorCode); assert.ok(entry.safeMessage);
      assert.ok(!logs.includes("server_listening"));
      for (const secret of [url, key.toString("hex"), "qa-access-only", "qa-refresh-only", "qa-secret-only", "qa-resend-only", "private-fixture-secret"]) assert.ok(!logs.includes(secret));
      await stop();
      return entry;
    }
    assert.equal(ready, true, "Compiled artifact must become ready.");
  };
  const request = async (route: string, method = "GET", token?: string, body?: unknown) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  const auth = new AuthStore(null);
  const password = "qa-password-only-123";
  const host = auth.createLocal("Boot Host", `${crypto.randomUUID()}@example.test`, password);
  const guest = auth.createLocal("Boot Guest", `${crypto.randomUUID()}@example.test`, password);
  for (const user of [host, guest]) auth.consumeVerification(auth.issueToken(user.id, "EMAIL_VERIFICATION", 60000, 0)!);
  const session = auth.createSession(host.id), guestSession = auth.createSession(guest.id);
  const social = new SocialStore();
  const house = social.createHouse(host, "Legacy Boot QA");
  const invalidHouseId = `qa-invalid-${crypto.randomUUID()}`;
  const legacy = social.createInvite(house.id, host, { expiresInHours: 24, maxUses: 3 })!;
  const media = { id: crypto.randomUUID(), provider: "youtube" as const, providerMediaId: crypto.randomBytes(8).toString("base64url"), type: "video" as const, title: "Boot QA", duration: 120 };
  try {
    const authRepo = new PrismaAuthRepository(db, auth);
    await authRepo.saveUser(host.id); await authRepo.saveUser(guest.id);
    await new PrismaSocialRepository(db, social, (id) => auth.getUser(id)).saveHouse(house.id);
    await db.houseInvite.update({ where: { id: legacy.id }, data: { codeHash: null } });
    const store = new RoomStore();
    store.addHouseRoom({ houseId: house.id, houseName: house.name, roomId: house.primaryRoomId });
    store.saveLibrary(house.primaryRoomId, host, media);
    store.toggleFavorite(house.primaryRoomId, host, media);
    const playlist = store.createPlaylist(house.primaryRoomId, host, "Boot playlist")!;
    store.addPlaylistItem(house.primaryRoomId, playlist.id, host, media);
    store.addQueueItem(house.primaryRoomId, { ...media, id: crypto.randomUUID(), addedBy: host, addedAt: new Date().toISOString() });
    await new PrismaMediaRepository(db, store, (id) => auth.getUser(id)).saveHouse(house.primaryRoomId);
    await db.googleDriveConnection.create({ data: { userId: host.id, scopes: "drive.readonly", encryptedCredentials: encrypt() } });
    await start();
    assert.equal((await request("/api/auth/session", "GET", session)).status, 200);
    assert.equal((await request("/api/auth/login", "POST", undefined, { email: host.email, password })).status, 200);
    assert.equal((await request(`/api/houses/${house.id}`, "GET", session)).status, 200);
    assert.equal((await request(`/api/invites/${legacy.token}`)).data.status, "VALID");
    assert.equal((await request(`/api/invites/${legacy.token}/accept`, "POST", guestSession)).status, 200);
    const created = await request(`/api/houses/${house.id}/invites`, "POST", session, { expiresInHours: 24, maxUses: 3 });
    assert.equal(created.status, 201);
    const invite = created.data.invite;
    await stop(); await start();
    assert.equal((await request(`/api/invites/${legacy.token}`)).data.status, "VALID");
    assert.equal((await db.houseInvite.findUnique({ where: { id: legacy.id } }))?.codeHash, null);
    for (const identifier of [invite.code, invite.token]) {
      assert.equal((await request(`/api/invites/${identifier}`)).data.status, "VALID");
      assert.equal((await request(`/api/invites/${identifier}/accept`, "POST", guestSession)).status, 200);
    }
    const hub = (await request(`/api/media-hub/${house.primaryRoomId}`, "GET", session)).data;
    assert.equal(hub.library.length, 1); assert.equal(hub.favorites.length, 1); assert.equal(hub.playlists.length, 1);
    assert.equal((await request(`/api/rooms/${house.primaryRoomId}`, "GET", session)).data.snapshot.queue.length, 1);
    assert.equal((await request(`/api/houses/${house.id}/invites/${invite.id}`, "DELETE", session)).status, 204);
    await stop(); await start();
    for (const identifier of [invite.code, invite.token]) assert.notEqual((await request(`/api/invites/${identifier}`)).data.status, "VALID");
    await stop();
    await db.googleDriveConnection.update({ where: { userId: host.id }, data: { encryptedCredentials: "private-fixture-secret" } });
    const driveError = await start("DRIVE_RESTORE");
    assert.match(driveError.safeMessage, /cofre de tokens/);
    await db.googleDriveConnection.update({ where: { userId: host.id }, data: { encryptedCredentials: encrypt() } });
    await db.mediaItem.updateMany({ where: { providerMediaId: media.providerMediaId }, data: { metadata: "private-fixture-secret" } });
    assert.equal((await start("MEDIA_RESTORE")).errorName, "SyntaxError");
    await db.mediaItem.updateMany({ where: { providerMediaId: media.providerMediaId }, data: { metadata: null } });
    await db.group.create({ data: { id: invalidHouseId, name: "QA missing Party", ownerId: host.id } });
    assert.equal((await start("HOUSE_RESTORE")).safeMessage, "Casa sem exatamente uma Party persistida.");
    await db.group.delete({ where: { id: invalidHouseId } });
    await db.user.update({ where: { id: host.id }, data: { email: "private-fixture-secret" } });
    assert.equal((await start("AUTH_RESTORE")).errorName, "ZodError");
    await db.user.update({ where: { id: host.id }, data: { email: host.email } });
    await start(); await stop();
  } finally {
    await stop();
    await db.group.deleteMany({ where: { id: { in: [house.id, invalidHouseId] } } });
    await db.user.deleteMany({ where: { id: { in: [host.id, guest.id] } } });
    await db.mediaItem.deleteMany({ where: { providerMediaId: media.providerMediaId } });
    await db.$disconnect();
  }
});
