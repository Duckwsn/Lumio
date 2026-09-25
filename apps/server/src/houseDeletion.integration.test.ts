import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { io as connect } from "socket.io-client";

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = net.createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => address && typeof address !== "string" ? resolve(address.port) : reject(new Error("No port"))); });
});

test("DELETE House enforces roles, invalidates invites, clears Party and preserves accounts and other Houses", { timeout: 60_000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-delete-test-"));
  const port = await freePort();
  const outbox = path.join(directory, "mail.jsonl");
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: "http://127.0.0.1:5173", CLIENT_ORIGIN: "http://127.0.0.1:5173", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "" }, stdio: "ignore" });
  context.after(async () => { child.kill(); await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* startup */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  const request = (method: string, route: string, token?: string, body?: unknown) => fetch(`${base}${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const createUser = async (name: string) => {
    const email = `${crypto.randomUUID()}@example.test`, password = "safe-password-123";
    assert.equal((await request("POST", "/api/auth/signup", undefined, { displayName: name, email, password })).status, 201);
    const lines = fs.readFileSync(outbox, "utf8").trim().split("\n");
    const link = (JSON.parse(lines.at(-1)!) as { text: string }).text.match(/https?:\/\/\S+/)?.[0];
    assert.ok(link);
    assert.equal((await request("POST", "/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice("#token=".length) })).status, 204);
    const response = await request("POST", "/api/auth/login", undefined, { email, password }); assert.equal(response.status, 200);
    return response.json() as Promise<{ token: string; user: { id: string; displayName: string; color: string } }>;
  };
  const host = await createUser("Host"), admin = await createUser("Admin"), member = await createUser("Member"), outsider = await createUser("Outsider");
  const created = await request("POST", "/api/houses", host.token, { name: "Delete Me" }); assert.equal(created.status, 201);
  const house = (await created.json() as { house: { id: string; primaryRoomId: string } }).house;
  const kept = (await (await request("POST", "/api/houses", host.token, { name: "Keep Me" })).json() as { house: { id: string } }).house;
  const invite = await request("POST", `/api/houses/${house.id}/invites`, host.token, { expiresInHours: 24, maxUses: 3 }); assert.equal(invite.status, 201);
  const inviteToken = (await invite.json() as { invite: { token: string } }).invite.token;
  assert.equal((await request("POST", `/api/invites/${inviteToken}/accept`, admin.token)).status, 200);
  assert.equal((await request("POST", `/api/invites/${inviteToken}/accept`, member.token)).status, 200);
  assert.equal((await request("PATCH", `/api/houses/${house.id}/members/${admin.user.id}`, host.token, { role: "ADMIN" })).status, 204);
  const route = `/api/houses/${house.id}`;
  assert.equal((await request("DELETE", route)).status, 401);
  assert.equal((await request("DELETE", route, "invalid-token")).status, 401);
  assert.equal((await request("DELETE", route, outsider.token)).status, 404);
  assert.equal((await request("DELETE", route, member.token)).status, 403);
  assert.equal((await request("DELETE", route, admin.token, { role: "HOST" })).status, 403);
  assert.equal((await request("DELETE", "/api/houses/missing-house", host.token)).status, 404);
  const socket = connect(base, { auth: { token: member.token }, transports: ["websocket"], reconnection: false });
  context.after(() => socket.disconnect());
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  const snapshot = new Promise<void>((resolve) => socket.once("room:snapshot", () => resolve()));
  socket.emit("room:join", { roomId: house.primaryRoomId, user: member.user }); await snapshot;
  const deletionEvent = new Promise<{ houseId: string }>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("No house:deleted event")), 3000); socket.once("house:deleted", (payload) => { clearTimeout(timer); resolve(payload); }); });
  assert.equal((await request("DELETE", route, host.token)).status, 204);
  assert.deepEqual(await deletionEvent, { houseId: house.id });
  assert.equal((await request("DELETE", route, host.token)).status, 404);
  assert.equal((await request("GET", route, member.token)).status, 404);
  assert.equal((await request("GET", `/api/invites/${inviteToken}`)).status, 200);
  assert.equal((await request("POST", `/api/invites/${inviteToken}/accept`, outsider.token)).status, 410);
  assert.equal((await request("GET", `/api/media-hub/${house.primaryRoomId}`, host.token)).status, 403);
  assert.equal((await request("GET", `/api/houses/${kept.id}`, host.token)).status, 200);
  assert.equal((await request("GET", "/api/bootstrap", member.token)).status, 200);
});
