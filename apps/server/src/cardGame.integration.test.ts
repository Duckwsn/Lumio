import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { io, type Socket } from "socket.io-client";
import type { CardSnapshot, GameAck, PartyGameSnapshot, User } from "@lumio/shared";

test("Cards authenticated sockets: complete three-player match, private projections, reconnect and late observer", { timeout: 60000 }, async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-cards-socket-"));
  const port = await new Promise<number>((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); }); });
  const outbox = path.join(directory, "mail.jsonl"), origin = "http://127.0.0.1:5173";
  const child = spawn(process.execPath, ["--import", "tsx", "--import", pathToFileURL(path.resolve("../../e2e/fixtures/cardDeckLoader.mjs")).href, "src/index.ts"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: "development", PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "" }, stdio: "ignore" });
  const sockets: Socket[] = [];
  context.after(async () => { sockets.forEach((s) => s.disconnect()); child.kill(); await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]); fs.rmSync(directory, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${port}`;
  const until = async (predicate: () => boolean | Promise<boolean>) => { for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("Cards socket condition timed out"); };
  await until(async () => { try { return (await fetch(api + "/api/health")).ok; } catch { return false; } });
  const request = (route: string, token?: string, body?: unknown) => fetch(api + route, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sessions: { token: string; user: User }[] = [];
  for (const displayName of ["Cards A", "Cards B", "Cards C", "Observer D"]) {
    const email = `${displayName.replaceAll(" ", "")}@example.test`, password = "local-card-test-123";
    assert.equal((await request("/api/auth/signup", undefined, { displayName, email, password })).status, 201);
    const link = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1)!).text.match(/https?:\/\/\S+/)[0];
    assert.equal((await request("/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice(7) })).status, 204);
    sessions.push(await (await request("/api/auth/login", undefined, { email, password })).json());
  }
  const { house } = await (await request("/api/houses", sessions[0].token, { name: "Cards sockets QA" })).json();
  const { invite } = await (await request(`/api/houses/${house.id}/invites`, sessions[0].token, { maxUses: 4, expiresInHours: 1 })).json();
  for (const s of sessions.slice(1)) assert.equal((await request(`/api/invites/${invite.token}/accept`, s.token)).status, 200);
  const states: (CardSnapshot | null)[] = [null, null, null, null], traffic: unknown[][] = [[], [], [], []];
  const connect = async (i: number) => {
    const socket = io(api, { transports: ["websocket"], auth: { token: sessions[i].token }, extraHeaders: { Origin: origin } }); sockets[i] = socket;
    for (const event of ["game:snapshot", "game:state"]) socket.on(event, (s: PartyGameSnapshot | null) => { if (s?.gameType === "cards") states[i] = s; traffic[i].push(s); });
    await until(() => socket.connected);
    const joined = new Promise<void>((resolve) => socket.once("room:snapshot", () => resolve()));
    socket.emit("room:join", { roomId: house.primaryRoomId, user: sessions[i].user }); await joined;
  };
  const privacy = () => {
    for (let i = 0; i < states.length; i++) {
      const s = states[i]; if (!s) continue;
      assert.doesNotMatch(JSON.stringify(s), /"hands"|"deck"|"seed"|"drawOrder"/);
      for (let j = 0; j < states.length; j++) if (i !== j) for (const card of states[j]?.myHand ?? []) assert.equal(JSON.stringify(s).includes(card.id), false, "foreign private card must not appear anywhere in projection");
    }
    if (states[3]) { assert.equal(states[3].myHand, undefined); assert.equal(states[3].myPending, undefined); }
  };
  const send = async (i: number, type: string, extra: object = {}) => {
    await new Promise((resolve) => setTimeout(resolve, 160));
    const s = states[i]; const ack = await sockets[i].timeout(3000).emitWithAck("game:action", { gameType: "cards", type, roomId: house.primaryRoomId, ...(type === "open" ? {} : { sessionId: s!.sessionId, roundId: s!.roundId, revision: s!.revision }), ...extra }) as GameAck;
    if (ack.ok && states[i]) await until(() => states.filter(Boolean).every((v) => v!.revision === states[i]!.revision));
    privacy(); return ack;
  };
  for (let i = 0; i < 3; i++) await connect(i);
  assert.ok((await send(0, "open")).ok); await until(() => states.slice(0, 3).every(Boolean));
  for (let i = 0; i < 3; i++) assert.ok((await send(i, "join")).ok);
  assert.ok((await send(0, "start")).ok); await until(() => states[0]?.phase === "PLAYING");
  assert.equal((await sockets[0].timeout(3000).emitWithAck("game:action", { gameType: "cards", type: "open", roomId: "foreign-party" }) as GameAck).ok, false);
  assert.equal((await send(1, "draw")).ok, false);
  assert.equal((await send(0, "play", { cardId: states[1]!.myHand![0].id, declareLast: true })).ok, false);
  assert.deepEqual(states[0]!.myHand!.map((c) => [c.color, c.kind, c.value]), [["mint", "number", 1], ["mint", "draw_two", undefined], [null, "wild_draw", undefined], [null, "wild", undefined], ["tide", "number", 6], ["tide", "skip", undefined], ["tide", "number", 7]]);
  await connect(3); assert.ok((await send(3, "open")).ok); assert.equal((await send(3, "join")).ok, false);
  const play = async (i: number, color: string | null, kind: string, value?: number, declareLast = false, drawn = false) => {
    const card = states[i]!.myHand!.find((c) => c.color === color && c.kind === kind && c.value === value)!; assert.ok(card);
    assert.ok((await send(i, drawn ? "play_drawn" : "play", { cardId: card.id, declareLast })).ok);
  };
  await play(0, "mint", "number", 1);
  const oldHand = states[1]!.myHand, oldDeadline = states[1]!.turnEndsAt;
  sockets[1].disconnect(); await connect(1); await send(1, "open");
  assert.deepEqual(states[1]!.myHand, oldHand); assert.equal(states[1]!.turnEndsAt, oldDeadline);
  await play(1, "mint", "reverse"); assert.equal(states[0]!.direction, -1);
  await play(0, "mint", "draw_two"); assert.equal(states[2]!.myHand!.length, 9);
  assert.ok((await send(1, "draw")).ok);
  await play(0, null, "wild_draw"); assert.equal(states[0]!.myPending?.kind, "wild");
  assert.ok((await send(0, "choose_color", { color: "mint" })).ok); assert.equal(states[2]!.myHand!.length, 13);
  assert.ok((await send(1, "draw")).ok);
  await play(0, null, "wild"); assert.ok((await send(0, "choose_color", { color: "tide" })).ok);
  assert.ok((await send(2, "draw")).ok); assert.equal(states[2]!.myPending?.kind, "drawn");
  assert.equal((await send(2, "draw")).ok, false); await play(2, "tide", "number", 4, false, true);
  await play(1, "tide", "number", 1); await play(0, "tide", "number", 6);
  await play(2, "tide", "number", 0); await play(1, "tide", "number", 2);
  await play(0, "tide", "skip", undefined, true); assert.equal(states[0]!.myHand!.length, 1); assert.ok(states[0]!.players.find((p) => p.id === sessions[0].user.id)!.declaredLast);
  await play(1, "tide", "number", 3); await play(0, "tide", "number", 7);
  assert.ok(states.every((s) => s?.phase === "RESULT" && s.winnerId === sessions[0].user.id));
  assert.ok((await send(0, "rematch")).ok); assert.ok(states.every((s) => s?.phase === "LOBBY"));
  assert.ok((await send(3, "join")).ok); assert.equal(states[3]!.players.filter((p) => p.participating).length, 4);
  for (const stream of traffic) assert.doesNotMatch(JSON.stringify(stream), /"hands"|"deck"|"seed"|"drawOrder"/);
});
