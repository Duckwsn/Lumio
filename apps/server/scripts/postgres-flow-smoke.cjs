const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { PrismaClient } = require("@prisma/client");

const databaseUrl = process.env.LUMIO_TEST_DATABASE_URL || "postgresql://lumio_dev:lumio_local_only@127.0.0.1:5433/lumio_test?schema=public";
const parsed = new URL(databaseUrl);
if (!parsed.pathname.endsWith("/lumio_test") || !["127.0.0.1", "localhost"].includes(parsed.hostname)) throw new Error("Flow smoke exige banco local lumio_test.");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-db-flow-"));
const outbox = path.join(directory, "mailbox.jsonl");
const base = "http://127.0.0.1:4019";
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let child;
let userId = "", houseId = "", email = "";
const mediaId = `smoke-${crypto.randomUUID()}`;
const media = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: crypto.randomBytes(9).toString("base64url").slice(0, 11), type: "video", title: mediaId, duration: 120 };

async function start() {
  child = spawn(process.execPath, [path.resolve(__dirname, "../dist/index.js")], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "development", PERSISTENCE_MODE: "postgres", DATABASE_URL: databaseUrl,
      PORT: "4019", CLIENT_ORIGIN: "http://localhost:5173", APP_PUBLIC_URL: "http://localhost:5173", API_PUBLIC_URL: base,
      EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox,
      GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Backend encerrou durante boot.");
    try { const response = await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(500) }); if (response.ok) return; } catch { /* Boot in progress. */ }
    await delay(200);
  }
  throw new Error("Backend não ficou pronto.");
}
async function stop() {
  if (!child) return;
  if (child.exitCode === null) { const exit = once(child, "exit"); child.kill("SIGTERM"); await Promise.race([exit, delay(5_000).then(() => { throw new Error("Backend não encerrou em 5s."); })]); }
  child = undefined;
}
async function request(url, method = "GET", token, body) {
  const response = await fetch(`${base}${url}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

(async () => {
  try {
    await db.$connect(); await start();
    email = `${crypto.randomUUID()}@example.test`;
    assert.equal((await request("/api/auth/signup", "POST", undefined, { displayName: "Flow Test", email, password: "passw0rd-safe" })).status, 201);
    const mail = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1));
    const link = mail.text.match(/https?:\/\/\S+/)?.[0];
    assert.ok(link);
    const verification = new URL(link).hash.slice(1);
    const token = new URLSearchParams(verification).get("token");
    assert.ok(token);
    assert.equal((await request("/api/auth/verification/confirm", "POST", undefined, { token })).status, 204);
    const login = await request("/api/auth/login", "POST", undefined, { email, password: "passw0rd-safe" });
    assert.equal(login.status, 200); userId = login.data.user.id;
    const session = login.data.token;
    const created = await request("/api/houses", "POST", session, { name: "Flow House" });
    assert.equal(created.status, 201); houseId = created.data.house.id;
    const roomId = created.data.house.primaryRoomId;
    const invite = await request(`/api/houses/${houseId}/invites`, "POST", session, { expiresInHours: 24, maxUses: 1, role: "MEMBER" });
    assert.equal(invite.status, 201);
    assert.equal((await request(`/api/media-hub/${roomId}/library`, "POST", session, { item: media })).status, 201);
    assert.equal((await request(`/api/media-hub/${roomId}/favorite`, "POST", session, { item: media })).status, 200);
    const playlist = await request(`/api/media-hub/${roomId}/playlists`, "POST", session, { name: "Flow Playlist" });
    assert.equal(playlist.status, 201);
    assert.equal((await request(`/api/media-hub/${roomId}/playlists/${playlist.data.playlist.id}/items`, "POST", session, { item: media })).status, 201);
    assert.equal((await request(`/api/media-hub/${roomId}/playlists/${playlist.data.playlist.id}/queue`, "POST", session, { mode: "append", playNow: false, revision: 0 })).status, 200);
    await stop(); await start();
    assert.equal((await request("/api/auth/session", "GET", session)).status, 200);
    assert.equal((await request(`/api/houses/${houseId}`, "GET", session)).status, 200);
    assert.equal((await request(`/api/invites/${invite.data.invite.token}`)).data.status, "VALID");
    const hub = await request(`/api/media-hub/${roomId}`, "GET", session);
    assert.equal(hub.status, 200);
    assert.equal(hub.data.library.length, 1);
    assert.equal(hub.data.favorites.length, 1);
    assert.equal(hub.data.playlists.length, 1);
    const party = await request(`/api/rooms/${roomId}`, "GET", session);
    assert.equal(party.status, 200);
    assert.equal(party.data.snapshot.queue.length, 1);
    assert.equal(party.data.snapshot.currentMedia.state, "idle");
    process.stdout.write("PostgreSQL API flow and restart persistence: OK\n");
  } finally {
    await stop();
    if (houseId) await db.group.deleteMany({ where: { id: houseId } });
    if (userId || email) await db.user.deleteMany({ where: userId ? { id: userId } : { email } });
    await db.mediaItem.deleteMany({ where: { provider: media.provider, providerMediaId: media.providerMediaId } });
    await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
