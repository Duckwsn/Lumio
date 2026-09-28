import assert from "node:assert/strict";
import test from "node:test";
import type { GameAction, User } from "@lumio/shared";
import { DrawGameRuntime, normalizeGuess } from "./drawGame.js";

const users: User[] = ["Ana", "Bia", "Caio", "Observador"].map((displayName, index) => ({ id: String(index), displayName, color: "#69a982" }));
function fixture(count = 3, drawDuration = 1000) {
  let now = 1000, deltas = 0, snapshots = 0;
  const runtime = new DrawGameRuntime((_room, delta) => { if (delta) deltas++; else snapshots++; }, () => now, { choose: 100, draw: drawDuration, result: 100 }, ["coração", "guarda-chuva", "trem", "sol"]);
  const snap = (user = 0) => runtime.snapshot("party", users[user].id)!;
  const act = (user: number, type: GameAction["type"], extra: object = {}) => {
    const s = snap(user);
    return runtime.action("party", users[user], type === "open" ? { type, roomId: "party" } : { type, roomId: "party", sessionId: s.sessionId, roundId: s.roundId, revision: s.revision, ...extra });
  };
  assert.equal(act(0, "open").ok, true);
  for (let index = 0; index < count; index++) assert.equal(act(index, "join").ok, true);
  return { runtime, snap, act, advance: (ms: number, tick = true) => { now += ms; if (tick) runtime.tick(); }, deltas: () => deltas, snapshots: () => snapshots };
}
const stroke = (id = "stroke") => ({ strokeId: id, offset: 0, tool: "brush", color: "#26332c", width: .012, points: [{ x: .1, y: .2 }, { x: .5, y: .7 }] });

test("session, explicit participation, host, minimum, stable order and leave", () => {
  const f = fixture(1);
  assert.equal(f.snap().hostId, "0"); assert.equal(f.snap().players.length, 1);
  assert.equal(f.act(0, "start").ok, false);
  assert.equal(f.act(1, "join").ok, true); assert.equal(f.act(1, "start").ok, false);
  assert.equal(f.act(0, "start").ok, true);
  assert.deepEqual(f.snap().order, ["0", "1"]); assert.equal(f.snap().totalRounds, 4);
  assert.equal(f.act(3, "join").ok, false); assert.equal(f.snap(3).players.length, 2);
  assert.equal(f.act(0, "leave").ok, true); assert.equal(f.snap().hostId, "1"); assert.equal(f.snap().phase, "ROUND_RESULT");
});
test("private word projection, choice authority, timeout auto-choice and late join", () => {
  const f = fixture(); f.act(0, "start");
  assert.equal(f.snap(0).choices!.length, 3);
  for (const viewer of [1, 2, 3]) { assert.equal(f.snap(viewer).choices, undefined); assert.equal(f.snap(viewer).secretWord, undefined); }
  assert.equal(f.act(1, "choose", { option: 0 }).ok, false);
  const expected = f.snap().choices![0]; f.advance(100);
  assert.equal(f.snap().secretWord, expected); assert.equal(f.snap().phase, "DRAWING");
  for (const viewer of [1, 2, 3]) {
    const publicState = f.snap(viewer);
    assert.equal(publicState.secretWord, undefined); assert.equal(publicState.revealedWord, undefined);
    assert.ok(!JSON.stringify(publicState).includes(expected));
  }
  assert.equal(f.act(3, "join").ok, false);
});
test("guess normalization, wrong guesses, scoring, duplicate safety and early result", () => {
  const f = fixture(); f.act(0, "start");
  const choice = f.snap().choices!.findIndex((word) => word === "coração");
  f.act(0, "choose", { option: choice >= 0 ? choice : 0 });
  const word = f.snap().secretWord!;
  assert.equal(normalizeGuess("  CORAÇÃO   FELIZ "), "coracao feliz");
  assert.equal(f.act(0, "guess", { text: word }).ok, false);
  assert.equal(f.act(3, "guess", { text: word }).ok, false);
  assert.equal(f.act(1, "guess", { text: "palpite obviamente errado" }).ok, true);
  assert.ok(f.snap(2).feed.some((entry) => entry.text.includes("palpite obviamente errado")));
  assert.equal(f.act(1, "guess", { text: ` ${normalizeGuess(word).toUpperCase()} ` }).ok, true);
  assert.equal(f.snap().players[1].score, 200); assert.equal(f.snap().players[0].score, 40);
  assert.deepEqual(f.snap().roundPoints, { "1": 200, "0": 40 });
  assert.equal(typeof f.snap().feed.at(-1)?.createdAt, "number");
  assert.equal(f.snap().phase, "DRAWING"); assert.ok(!JSON.stringify(f.snap(2)).includes(word));
  assert.equal(f.act(1, "guess", { text: word }).ok, false); assert.equal(f.snap().players[1].score, 200);
  assert.equal(f.act(2, "guess", { text: word }).ok, true); assert.equal(f.snap().phase, "ROUND_RESULT");
  assert.equal(f.snap(2).revealedWord, word); assert.equal(f.snap().players[0].score, 80);
  assert.deepEqual(f.snap().roundPoints, { "1": 200, "2": 200, "0": 80 });
  f.advance(100); assert.deepEqual(f.snap().roundPoints, {});
});
test("validated drawing, incremental reconstruction, undo, clear and stale operations", () => {
  const f = fixture(); f.act(0, "start"); f.act(0, "choose", { option: 0 });
  assert.equal(f.act(1, "stroke", stroke()).ok, false); assert.equal(f.act(3, "stroke", stroke()).ok, false);
  assert.equal(f.act(0, "stroke", { ...stroke(), points: [{ x: NaN, y: 2 }] }).ok, false);
  assert.equal(f.act(0, "stroke", { ...stroke(), score: 999 }).ok, false);
  const notifications = f.snapshots();
  assert.equal(f.act(0, "stroke", stroke()).ok, true); assert.equal(f.deltas(), 1);
  assert.equal(f.act(0, "stroke", { ...stroke(), offset: 2, points: [{ x: 1, y: 1 }] }).ok, true);
  assert.equal(f.snap(2).strokes[0].points.length, 3);
  assert.equal(f.snapshots(), notifications, "Drawing must use deltas, not full snapshots");
  assert.equal(f.act(0, "stroke", stroke()).ok, false);
  assert.equal(f.act(0, "stroke", { ...stroke("eraser"), tool: "eraser" }).ok, true);
  f.advance(1001); // avoid control rate when starting a fresh round
  f.advance(100); const drawer = Number(f.snap().drawerId); f.act(drawer, "choose", { option: 0 });
  f.act(drawer, "stroke", stroke("new"));
  const old = f.snap(); assert.equal(f.act(drawer, "undo").ok, true); assert.deepEqual(f.snap().strokes, []);
  assert.equal(f.act(drawer, "stroke", { ...stroke("new"), revision: old.revision }).ok, false);
  f.act(drawer, "stroke", stroke("after-undo")); assert.equal(f.act(drawer, "clear").ok, true); assert.deepEqual(f.snap(2).strokes, []);
  assert.equal(f.act(0, "stroke", { ...stroke(), roundId: old.roundId }).ok, false);
});
test("server deadlines reject guesses/drawing and advance phases without client timers", () => {
  const f = fixture(); f.act(0, "start"); f.act(0, "choose", { option: 0 });
  const word = f.snap().secretWord!, notifications = f.snapshots(); f.advance(500);
  assert.equal(f.snapshots(), notifications, "The visual countdown needs no per-second broadcast"); f.advance(500, false);
  assert.equal(f.snap().phase, "DRAWING");
  assert.equal(f.act(1, "guess", { text: word }).ok, false); assert.equal(f.act(0, "stroke", stroke()).ok, false);
  f.runtime.tick();
  f.advance(100); assert.equal(f.snap().round, 2); assert.equal(f.snap().drawerId, "1");
  assert.equal(f.snap(0).secretWord, undefined);
});
test("disconnect grace restores board; expiry skips drawer and transfers coordinator", () => {
  const f = fixture(); f.act(0, "start"); f.act(0, "choose", { option: 0 }); f.act(0, "stroke", stroke());
  const before = f.snap(); f.runtime.presence("party", "0", false); f.runtime.presence("party", "0", true);
  assert.deepEqual(f.snap().strokes, before.strokes); assert.equal(f.snap().secretWord, before.secretWord);
  f.runtime.presence("party", "0", false); f.advance(5000); assert.equal(f.snap().hostId, "1");
  assert.equal(f.snap().phase, "ROUND_RESULT"); f.advance(100); assert.equal(f.snap().drawerId, "1");
});
test("complete two cycles, final ranking, rematch and independent Party cleanup", () => {
  const f = fixture(); f.act(0, "start"); const order: string[] = [];
  for (let round = 0; round < 6; round++) {
    order.push(f.snap().drawerId!); f.advance(100); f.advance(1000); f.advance(100);
  }
  assert.deepEqual(order, ["0", "1", "2", "0", "1", "2"]); assert.equal(f.snap().phase, "GAME_RESULT");
  const sessionId = f.snap().sessionId; assert.equal(f.act(0, "rematch").ok, true);
  assert.equal(f.snap().sessionId, sessionId); assert.equal(f.snap().round, 1); assert.equal(f.snap().phase, "CHOOSING_WORD");
  assert.equal(f.act(1, "sync", { sessionId: "old-session" }).ok, false);
  f.runtime.delete("party"); assert.equal(f.runtime.snapshot("party", "0"), null);
  const g = fixture();
  for (let i = 3; i < 12; i++) {
    const s = g.snap();
    assert.equal(g.runtime.action("party", { id: `extra${i}`, displayName: `Extra ${i}`, color: "#69a982" }, { type: "join", roomId: "party", sessionId: s.sessionId, roundId: s.roundId, revision: s.revision }).ok, true);
  }
  g.act(0, "start");
  for (let round = 0; round < 23; round++) { g.advance(100); g.advance(1000); g.advance(100); }
  g.advance(100); g.runtime.leave("party", "0"); g.advance(1000); g.advance(100);
  assert.equal(g.snap().phase, "GAME_RESULT"); assert.equal(g.snap().players.length, 12);
  assert.equal(g.act(3, "join").ok, true, "Departed score records must not consume next-game slots");
  assert.equal(g.act(1, "rematch").ok, true); assert.equal(g.snap().players.length, 12);
});
test("abandoned coordinator, rate limits and idle cleanup", () => {
  const f = fixture(0); f.runtime.presence("party", "0", false); f.advance(5000); f.act(1, "join"); assert.equal(f.snap().hostId, "1");
  for (let i = 0; i < 10; i++) f.act(1, "sync"); assert.equal(f.act(1, "sync").ok, false);
  f.advance(30 * 60_000 + 1); assert.equal(f.runtime.snapshot("party", "1"), null);
  const g = fixture(); g.act(0, "start"); g.act(0, "choose", { option: 0 });
  for (let i = 0; i < 129; i++) { if (i % 30 === 0) g.advance(1); const result = g.act(0, "stroke", stroke(String(i))); if (i < 35) assert.equal(result.ok, true); }
  assert.ok(g.snap().strokes.length <= 128); assert.ok(g.deltas() <= 35);
});
test("hard stroke, append, total point and participant caps are enforced separately from throttling", () => {
  const f = fixture(0, 600000);
  for (let i = 0; i < 12; i++) assert.equal(f.runtime.action("party", { id: `p${i}`, displayName: `Player ${i}`, color: "#69a982" }, { type: "join", roomId: "party", sessionId: f.snap().sessionId, roundId: "lobby", revision: f.snap().revision }).ok, true);
  assert.equal(f.act(0, "join").ok, false);
  const g = fixture(3, 600000); g.act(0, "start"); g.act(0, "choose", { option: 0 });
  for (let i = 0; i < 128; i++) { if (i % 30 === 0) g.advance(1000); assert.equal(g.act(0, "stroke", stroke(`s${i}`)).ok, true); }
  assert.equal(g.act(0, "stroke", stroke("overflow")).ok, false); assert.equal(g.snap().strokes.length, 128);
  const h = fixture(3, 600000); h.act(0, "start"); h.act(0, "choose", { option: 0 });
  const points = Array.from({ length: 32 }, () => ({ x: .5, y: .5 }));
  for (let id = 0; id < 16; id++) {
    h.advance(1000);
    for (let offset = 0; offset < 512; offset += 32) assert.equal(h.act(0, "stroke", { ...stroke(`p${id}`), offset, points }).ok, true);
    assert.equal(h.act(0, "stroke", { ...stroke(`p${id}`), offset: 512, points: points.slice(0, 1) }).ok, false);
  }
  assert.equal(h.snap().strokes.reduce((n, item) => n + item.points.length, 0), 8192);
  assert.equal(h.act(0, "stroke", { ...stroke("total-overflow"), points: points.slice(0, 1) }).ok, false);
});
