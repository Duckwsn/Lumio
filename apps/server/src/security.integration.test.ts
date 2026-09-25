import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { io as connect } from "socket.io-client";

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No port")));
  });
});

test("Google-only preview rejects email signup before creating an account or sending mail", { timeout: 20_000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-google-only-"));
  const port = await freePort();
  const outbox = path.join(directory, "mail.jsonl");
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "", AUTH_SIGNUP_MODE: "google-only", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: "http://127.0.0.1:5173", CLIENT_ORIGIN: "http://127.0.0.1:5173", GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: "ignore",
  });
  context.after(async () => {
    child.kill();
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* Wait for isolated server. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true);
  const response = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Friend", email: "friend@example.test", password: "long-password-123" }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json() as { code: string }).code, "EMAIL_SIGNUP_DISABLED");
  assert.equal(fs.existsSync(outbox), false);
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "friend@example.test", password: "long-password-123" }) });
  assert.equal(login.status, 401);
});

test("HTTP verification/reset gates real endpoints and rejects token replay", { timeout: 30_000 }, async (context) => {
  const startupStarted = performance.now();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-security-"));
  const port = await freePort();
  const storeFile = path.join(directory, "auth.json"), outbox = path.join(directory, "mail.jsonl");
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "development", AUTH_STORE_FILE: storeFile, EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: "http://127.0.0.1:5173", CLIENT_ORIGIN: "http://127.0.0.1:5173", GOOGLE_TOKEN_ENCRYPTION_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLogs = "";
  for (const output of [child.stdout, child.stderr]) output?.on("data", (chunk: Buffer) => { serverLogs += chunk.toString(); });
  context.after(async () => {
    child.kill();
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) { ready = true; break; } } catch { /* Wait for isolated server. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `isolated server did not start: ${serverLogs.slice(-500)}`);
  context.diagnostic(`isolated local startup: ${Math.round(performance.now() - startupStarted)} ms`);
  const readiness = await fetch(`${base}/api/ready`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(await readiness.json(), { ready: true });
  const invalidRoute = await fetch(`${base}/api/missing-route`);
  assert.match(invalidRoute.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
  const post = (route: string, body: unknown, bearer?: string) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  const signup = await post("/api/auth/signup", { displayName: "Duck", email: "duck@example.test", password: "long-password-123" });
  assert.equal(signup.status, 201);
  assert.equal((await signup.json() as { token?: string; pendingVerification: boolean }).pendingVerification, true);
  assert.equal((await post("/api/houses", { name: "Private" })).status, 401);
  assert.equal((await post("/api/auth/login", { email: "duck@example.test", password: "long-password-123" })).status, 403);
  const mail = () => fs.readFileSync(outbox, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { text: string });
  const token = new URL(mail()[0].text.match(/https?:\/\/\S+/)![0]).hash.slice("#token=".length);
  assert.equal((await post("/api/auth/verification/confirm", { token: `${token.slice(0, -1)}x` })).status, 400);
  assert.equal((await post("/api/auth/verification/confirm", { token })).status, 204);
  assert.equal((await post("/api/auth/verification/confirm", { token })).status, 400);
  const login = await post("/api/auth/login", { email: "duck@example.test", password: "long-password-123" });
  assert.equal(login.status, 200);
  const session = (await login.json() as { token: string }).token;
  const createdHouse = await post("/api/houses", { name: "Private", role: "HOST", userId: "someone-else" }, session);
  assert.equal(createdHouse.status, 201);
  const house = (await createdHouse.json() as { house: { id: string; primaryRoomId: string; role: string } }).house;
  assert.equal(house.role, "HOST");
  const forgot = await post("/api/auth/password/forgot", { email: "duck@example.test" });
  const absent = await post("/api/auth/password/forgot", { email: "absent@example.test" });
  assert.equal(forgot.status, 200);
  assert.equal(await forgot.text(), await absent.text());
  const resetToken = new URL(mail()[1].text.match(/https?:\/\/\S+/)![0]).hash.slice("#token=".length);
  assert.equal((await post("/api/auth/password/reset", { token: resetToken, password: "new-long-password" })).status, 204);
  assert.equal((await post("/api/auth/password/reset", { token: resetToken, password: "another-password" })).status, 400);
  assert.equal((await fetch(`${base}/api/bootstrap`, { headers: { Authorization: `Bearer ${session}` } })).status, 401);
  assert.equal((await post("/api/auth/login", { email: "duck@example.test", password: "long-password-123" })).status, 401);
  const relogin = await post("/api/auth/login", { email: "duck@example.test", password: "new-long-password" });
  assert.equal(relogin.status, 200);
  const hostSession = await relogin.json() as { token: string; user: { id: string; displayName: string; color: string } };
  const hostToken = hostSession.token;
  const bootstrapSamples: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const started = performance.now();
    const response = await fetch(`${base}/api/bootstrap`, { headers: { Authorization: `Bearer ${hostToken}` } });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    bootstrapSamples.push(performance.now() - started);
  }
  bootstrapSamples.sort((a, b) => a - b);
  context.diagnostic(`local /api/bootstrap n=30 p50=${bootstrapSamples[14].toFixed(1)} ms p95=${bootstrapSamples[28].toFixed(1)} ms (loopback, not production)`);
  for (let index = 0; index < 50; index += 1) {
    const churnSocket = connect(base, { auth: { token: hostToken }, transports: ["websocket"], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => { churnSocket.once("connect", resolve); churnSocket.once("connect_error", reject); });
      const snapshot = new Promise<void>((resolve) => churnSocket.once("room:snapshot", () => resolve()));
      churnSocket.emit("room:join", { roomId: house.primaryRoomId, user: hostSession.user });
      await snapshot;
    } finally { churnSocket.disconnect(); }
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/groups`)).status, 404);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: "https://attacker.example" } })).headers.get("access-control-allow-origin"), null);
  assert.equal((await post("/api/auth/signup", { displayName: "Maria", email: "maria@example.test", password: "maria-password-123" })).status, 201);
  const mariaToken = new URL(mail()[2].text.match(/https?:\/\/\S+/)![0]).hash.slice("#token=".length);
  assert.equal((await post("/api/auth/verification/confirm", { token: mariaToken })).status, 204);
  const mariaLogin = await post("/api/auth/login", { email: "maria@example.test", password: "maria-password-123" });
  const maria = await mariaLogin.json() as { token: string; user: { id: string; displayName: string; color: string } };
  assert.equal((await fetch(`${base}/api/houses/${house.id}`, { headers: { Authorization: `Bearer ${maria.token}` } })).status, 404);
  assert.equal((await fetch(`${base}/api/media-hub/${house.primaryRoomId}`, { headers: { Authorization: `Bearer ${maria.token}` } })).status, 403);
  const socket = connect(base, { auth: { token: maria.token }, transports: ["websocket"], reconnection: false });
  context.after(() => socket.disconnect());
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  const rejectedJoin = new Promise<string>((resolve) => socket.once("server:error", resolve));
  socket.emit("room:join", { roomId: house.primaryRoomId, user: maria.user });
  assert.match(await rejectedJoin, /não faz parte/i);
  socket.emit("screen:start", null as never);
  socket.emit("chat:typing", null as never);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const createdInvite = await post(`/api/houses/${house.id}/invites`, { expiresInHours: 1, maxUses: 1 }, hostToken);
  assert.equal(createdInvite.status, 201);
  const invite = (await createdInvite.json() as { invite: { token: string } }).invite;
  assert.equal((await post(`/api/invites/${invite.token}/accept`, {}, maria.token)).status, 200);
  const joined = new Promise<void>((resolve) => socket.once("room:snapshot", () => resolve()));
  socket.emit("room:join", { roomId: house.primaryRoomId, user: maria.user });
  await joined;
  const removed = new Promise<void>((resolve) => socket.once("member:removed", () => resolve()));
  const removal = await fetch(`${base}/api/houses/${house.id}/members/${maria.user.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${hostToken}` } });
  assert.equal(removal.status, 204);
  await removed;
  assert.equal((await fetch(`${base}/api/media-hub/${house.primaryRoomId}`, { headers: { Authorization: `Bearer ${maria.token}` } })).status, 403);
  const oversized = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(70_000) }) });
  assert.equal(oversized.status, 413);
  assert.deepEqual(Object.keys(await oversized.json() as object), ["message"]);
  const invalidJson = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalidJson.status, 400);
  assert.match(serverLogs, /"event":"http_request"/);
  assert.match(serverLogs, /"event":"party_joined"/);
  for (const secret of [session, hostToken, maria.token, token, resetToken, mariaToken, invite.token]) assert.equal(serverLogs.includes(secret), false, "server logs must not include credentials or invite tokens");
});
