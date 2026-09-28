import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { io, type Socket } from "socket.io-client";
import type { DrawSnapshot, DrawState, DrawDelta, GameAck } from "@lumio/shared";

test("three authenticated real sockets: private choices, drawing, scoring, advance and membership", { timeout: 60000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-draw-socket-"));
  const port = await new Promise<number>((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); }); });
  const outbox = path.join(directory, "mail.jsonl"), origin = "http://127.0.0.1:5173";
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "" }, stdio: "ignore" });
  const sockets: Socket[] = [];
  context.after(async () => { sockets.forEach((socket) => socket.disconnect()); child.kill(); await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); fs.rmSync(directory, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${port}`;
  const until = async (predicate: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("Game integration condition timed out"); };
  await until(async () => { try { return (await fetch(api + "/api/health")).ok; } catch { return false; } });
  const request = (route: string, token?: string, body?: unknown, method = "POST") => fetch(api + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sessions = [];
  for (const displayName of ["AnaSocket", "BiaSocket", "CaioSocket"]) {
    const email = `${displayName}@example.test`, password = "local-draw-test-123";
    assert.equal((await request("/api/auth/signup", undefined, { displayName, email, password })).status, 201);
    const link = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    assert.equal((await request("/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice(7) })).status, 204);
    sessions.push(await (await request("/api/auth/login", undefined, { email, password })).json());
  }
  const { house } = await (await request("/api/houses", sessions[0].token, { name: "Draw socket QA" })).json();
  const { invite } = await (await request(`/api/houses/${house.id}/invites`, sessions[0].token, { maxUses: 5, expiresInHours: 24 })).json();
  for (const session of sessions.slice(1)) assert.equal((await request(`/api/invites/${invite.token}/accept`, session.token)).status, 200);
  const states: (DrawSnapshot | null)[] = [null, null, null], traffic: unknown[][] = [[], [], []], deltas: DrawDelta[][] = [[], [], []];
  for (const [index, session] of sessions.entries()) {
    const socket = io(api, { transports: ["websocket"], auth: { token: session.token }, extraHeaders: { Origin: origin } }); sockets.push(socket);
    socket.on("game:snapshot", (s: DrawSnapshot | null) => { states[index] = s; traffic[index].push(s); });
    socket.on("game:state", (s: DrawState) => { states[index] = { ...s, strokes: states[index]?.strokes ?? [] }; traffic[index].push(s); });
    socket.on("game:draw", (delta: DrawDelta) => { deltas[index].push(delta); traffic[index].push(delta); });
    await until(() => socket.connected);
    socket.emit("room:join", { roomId: house.primaryRoomId, user: session.user });
    await new Promise<void>((resolve) => socket.once("room:snapshot", () => resolve()));
  }
  const send = async (index: number, type: string, extra: object = {}) => {
    const s = states[index]; const action = type === "open" ? { type, roomId: house.primaryRoomId } : { type, roomId: house.primaryRoomId, sessionId: s!.sessionId, roundId: s!.roundId, revision: s!.revision, ...extra };
    return await sockets[index].timeout(3000).emitWithAck("game:action", action) as GameAck;
  };
  assert.equal((await send(0, "open")).ok, true);
  await until(() => states.every(Boolean));
  for (let i = 0; i < 3; i++) assert.equal((await send(i, "join")).ok, true);
  await until(() => states.every((s) => s?.players.length === 3));
  assert.equal((await send(1, "start")).ok, false); assert.equal((await send(0, "start")).ok, true);
  await until(() => states.every((s) => s?.phase === "CHOOSING_WORD"));
  assert.equal(states[0]!.choices!.length, 3);
  for (const index of [1, 2]) { assert.equal(states[index]!.choices, undefined); assert.equal(states[index]!.secretWord, undefined); }
  const secret = states[0]!.choices![0]; assert.equal((await send(0, "choose", { option: 0 })).ok, true);
  await until(() => states.every((s) => s?.phase === "DRAWING"));
  const drawing = { strokeId: "integration-stroke", offset: 0, tool: "brush", color: "#26332c", width: .012, points: [{ x: .2, y: .2 }, { x: .8, y: .8 }] };
  assert.equal((await send(1, "stroke", drawing)).ok, false); assert.equal((await send(0, "stroke", drawing)).ok, true);
  await until(() => deltas.every((items) => items.length === 1)); assert.deepEqual(deltas[2][0].stroke.points, drawing.points);
  const strokePayloadBytes = Buffer.byteLength(JSON.stringify(deltas[2][0]));
  const start = performance.now();
  assert.equal((await send(1, "guess", { text: secret })).ok, true);
  await until(() => states[2]!.players[1].guessed);
  assert.ok(states[2]!.players[1].score >= 100); assert.equal(states[2]!.phase, "DRAWING");
  const metadata = traffic[2].at(-1) as DrawState;
  assert.equal("strokes" in metadata, false, "A guess must not retransmit the whole board");
  context.diagnostic(`local guess→remote state ${Math.round(performance.now() - start)}ms; 2-point delta ${strokePayloadBytes} bytes; no board in guess metadata (loopback, not WAN)`);
  // Inspect entire received payloads, not DOM/CSS: options, word and correct guess are absent.
  for (const index of [1, 2]) assert.ok(!JSON.stringify(traffic[index]).includes(secret), "Private word leaked in guesser wire payload before reveal");
  assert.equal((await send(1, "guess", { text: secret })).ok, false);
  assert.equal((await send(2, "guess", { text: secret })).ok, true);
  await until(() => states.every((s) => s?.phase === "ROUND_RESULT"));
  await until(() => states.every((s) => s?.round === 2 && s.phase === "CHOOSING_WORD"));
  assert.equal(states[1]!.drawerId, sessions[1].user.id); assert.equal(states[1]!.choices!.length, 3); assert.equal(states[0]!.choices, undefined);
  const invalidRoom = await sockets[0].timeout(3000).emitWithAck("game:action", { type: "open", roomId: "other-party" }) as GameAck; assert.equal(invalidRoom.ok, false);
  sockets[0].emit("game:action", { type: "open", roomId: "other-party" }, "not-an-ack");
  assert.equal((await send(0, "sync")).ok, true, "Malformed acknowledgment must not crash the server");
  assert.equal((await request(`/api/houses/${house.id}/members/${sessions[2].user.id}`, sessions[0].token, undefined, "DELETE")).status, 204);
  await until(() => !sockets[2].connected);
});
