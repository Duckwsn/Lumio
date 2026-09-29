import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { io, type Socket } from "socket.io-client";
import type { GameAck, HouseSummary, PartyGameSnapshot, RoomSnapshot, User } from "@lumio/shared";

test("S1 authenticated Home observers: multi-House isolation, all games, share, reconnect, revocation and cleanup", { timeout: 60000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-houses-s1-"));
  const port = await new Promise<number>((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const port = (server.address() as net.AddressInfo).port; server.close(() => resolve(port)); }); });
  const outbox = path.join(directory, "mail.jsonl"), origin = "http://127.0.0.1:5173", api = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "" }, stdio: "ignore" });
  const sockets: Socket[] = [];
  context.after(async () => { sockets.forEach((s) => s.disconnect()); child.kill(); await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); fs.rmSync(directory, { recursive: true, force: true }); });
  const until = async (fn: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error("House activity timed out"); };
  await until(async () => { try { return (await fetch(api + "/api/health")).ok; } catch { return false; } });
  const request = (route: string, token?: string, body?: unknown, method = "POST") => fetch(api + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sessions: { token: string; user: User }[] = [];
  for (const displayName of ["Ana", "Bia", "Caio", "Duda"]) {
    const email = displayName + "@example.test", password = "local-house-test-123";
    assert.equal((await request("/api/auth/signup", undefined, { displayName, email, password })).status, 201);
    const link = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    await request("/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice(7) });
    sessions.push(await (await request("/api/auth/login", undefined, { email, password })).json());
  }
  const x = (await (await request("/api/houses", sessions[0].token, { name: "Casa X" })).json()).house;
  const y = (await (await request("/api/houses", sessions[3].token, { name: "Casa Y" })).json()).house;
  const invite = async (houseId: string, actor: number, members: number[]) => {
    const { invite } = await (await request(`/api/houses/${houseId}/invites`, sessions[actor].token, { maxUses: 4, expiresInHours: 1 })).json();
    for (const i of members) assert.equal((await request(`/api/invites/${invite.code}/accept`, sessions[i].token)).status, 200);
  };
  await invite(x.id, 0, [1, 2]); await invite(y.id, 3, [0]);
  const summaries: HouseSummary[][] = [[], [], [], []], traffic: unknown[] = [], games: (PartyGameSnapshot | null)[] = [null, null];
  const connect = async (i: number) => {
    const socket = io(api, { transports: ["websocket"], auth: { token: sessions[i].token }, extraHeaders: { Origin: origin } }); sockets[i] = socket;
    socket.on("home:update", (houses) => { summaries[i] = houses; if (i === 2) traffic.push(houses); });
    socket.on("game:snapshot", (state) => { if (i < 2) games[i] = state; }); socket.on("game:state", (state) => { if (i < 2) games[i] = state; });
    await until(() => socket.connected && summaries[i].length > 0); return socket;
  };
  for (let i = 0; i < 4; i++) await connect(i);
  const current = () => summaries[2].find((h) => h.id === x.id)!;
  assert.equal(current().partyCount, 0); assert.equal(current().onlineCount, 3);
  assert.deepEqual(summaries[0].map((h) => h.id).sort(), [x.id, y.id].sort()); assert.deepEqual(summaries[3].map((h) => h.id), [y.id]);
  assert.equal((await request(`/api/houses/${x.id}`, sessions[3].token, undefined, "GET")).status, 404);
  const denied = new Promise<void>((resolve) => sockets[3].once("server:error", () => resolve()));
  sockets[3].emit("room:join", { roomId: x.primaryRoomId, user: sessions[3].user }); await denied;
  assert.deepEqual(summaries[3].map((h) => h.id), [y.id]);
  let room: RoomSnapshot | null = null;
  sockets[0].on("room:snapshot", (s) => { room = s; });
  for (let i = 0; i < 2; i++) { const joined = new Promise<void>((r) => sockets[i].once("room:snapshot", () => r())); sockets[i].emit("room:join", { roomId: x.primaryRoomId, user: sessions[i].user }); await joined; await until(() => current().partyCount === i + 1); }
  const before = JSON.stringify({ media: room!.currentMedia, queue: room!.queue });
  sockets[2].disconnect(); await connect(2); assert.equal(current().partyCount, 2);
  assert.equal(JSON.stringify({ media: room!.currentMedia, queue: room!.queue }), before);
  assert.equal(room!.members.some((m) => m.user.id === sessions[2].user.id), false, "Home never joins Party");
  const action = async (i: number, gameType: "draw" | "quiz" | "cards", type: string) => {
    await new Promise((r) => setTimeout(r, 180)); const state = games[i];
    const a = { type, roomId: x.primaryRoomId, ...(type === "open" ? {} : { sessionId: state!.sessionId, roundId: state!.roundId, revision: state!.revision }) };
    const payload = type === "end" ? { ...a, gameType } : gameType === "draw" ? { gameType, roomId: x.primaryRoomId, action: a } : { ...a, gameType };
    const ack = await sockets[i].timeout(3000).emitWithAck("game:action", payload) as GameAck;
    assert.equal(ack.ok, true, `${gameType}/${type}: ${ack.message}`);
  };
  for (const gameType of ["draw", "quiz", "cards"] as const) {
    await action(0, gameType, "open"); await until(() => games[0]?.gameType === gameType);
    assert.notEqual(current().partyActivity?.type, "game", "lobby is not active match");
    await action(0, gameType, "join"); await action(1, gameType, "join"); await action(0, gameType, "start");
    await until(() => current().partyActivity?.gameType === gameType);
    assert.match(current().partyActivity!.label, /^Partida de .* ativa$/);
    assert.equal(summaries[0].find((h) => h.id === y.id)?.partyActivity?.type, "idle");
    if (gameType === "draw") {
      const count = traffic.length; await new Promise((r) => setTimeout(r, 800)); assert.equal(traffic.length, count, "game timer does not fanout identical summaries");
    }
    assert.equal((await sockets[0].timeout(3000).emitWithAck("screen:start", { roomId: x.primaryRoomId })).ok, true);
    await until(() => current().partyActivity?.type === "screen"); sockets[0].emit("screen:stop", { roomId: x.primaryRoomId }); await until(() => current().partyActivity?.type === "game");
    await action(0, gameType, "end"); await until(() => current().partyActivity?.type === "party");
  }
  let latestMedia: RoomSnapshot["currentMedia"] | null = null;
  sockets[0].on("media:sync", (state) => { latestMedia = state; });
  const mediaState = () => latestMedia as RoomSnapshot["currentMedia"] | null;
  const item = { id: crypto.randomUUID(), provider: "youtube", providerMediaId: "dQw4w9WgXcQ", type: "video", title: "Filme da Casa", duration: 300, addedBy: sessions[0].user, addedAt: new Date().toISOString() };
  assert.equal((await sockets[0].timeout(3000).emitWithAck("queue:add", { roomId: x.primaryRoomId, item })).ok, true);
  assert.equal((await sockets[0].timeout(3000).emitWithAck("media:change", { roomId: x.primaryRoomId, item })).ok, true);
  await until(() => current().partyActivity?.type === "media"); assert.match(current().partyActivity!.label, /Filme da Casa/);
  assert.ok(mediaState());
  sockets[0].emit("media:pause", { roomId: x.primaryRoomId, mediaId: mediaState()!.mediaId, revision: mediaState()!.revision, operationId: crypto.randomUUID() });
  await until(() => current().partyActivity?.type === "party");
  sockets[0].emit("media:play", { roomId: x.primaryRoomId, mediaId: mediaState()!.mediaId, revision: mediaState()!.revision, operationId: crypto.randomUUID() });
  await until(() => current().partyActivity?.type === "media");
  const badTitle = { ...item, id: crypto.randomUUID(), providerMediaId: "M7lc1UVf-VE", title: "https://private.example/video?token=secret" };
  assert.equal((await sockets[0].timeout(3000).emitWithAck("queue:add", { roomId: x.primaryRoomId, item: badTitle })).ok, true);
  assert.equal((await sockets[0].timeout(3000).emitWithAck("media:change", { roomId: x.primaryRoomId, item: badTitle })).ok, true);
  await until(() => current().nowPlaying?.title === "mídia");
  assert.doesNotMatch(JSON.stringify(current()), /private\.example|token=secret/);
  assert.doesNotMatch(JSON.stringify(traffic), /secretWord|choices|correctAnswer|correctIndex|ownAnswer|myHand|legalCardIds|deck|pending|accessToken|ticket|grant|streamUrl|email/);
  assert.equal((await request(`/api/houses/${x.id}/members/${sessions[2].user.id}`, sessions[0].token, undefined, "DELETE")).status, 204);
  await until(() => summaries[2].length === 0); assert.equal((await request(`/api/houses/${x.id}`, sessions[2].token, undefined, "GET")).status, 404);
  sockets[0].disconnect(); sockets[1].disconnect(); await until(() => summaries[0].length > 0 && summaries[3][0].partyCount === 0);
  await connect(0); await until(() => summaries[0].find((h) => h.id === x.id)?.partyCount === 0);
  assert.equal((await request(`/api/houses/${x.id}`, sessions[0].token, undefined, "DELETE")).status, 204);
  await until(() => !summaries[0].some((h) => h.id === x.id)); assert.deepEqual(summaries[3].map((h) => h.id), [y.id]);
});
