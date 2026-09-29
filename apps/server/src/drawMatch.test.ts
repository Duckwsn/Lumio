import assert from "node:assert/strict";
import test from "node:test";
import { gameActionSchema, drawThemes, type User, type GameAction } from "@lumio/shared";
import { DrawGameRuntime, guessPoints, matchWinners, normalizeGuess } from "./drawGame.js";
import { allDrawWords, drawWordBanks, drawWords } from "./drawWords.js";

function fixture(count = 3, words: readonly string[] = allDrawWords) {
  let now = 10000;
  const users: User[] = Array.from({ length: count + 1 }, (_, i) => ({ id: String(i), displayName: `User ${i}`, color: "#69a982" }));
  const runtime = new DrawGameRuntime(() => {}, () => now, { choose: 100, draw: 1000, result: 100 }, words);
  const snap = (id = "0") => runtime.snapshot("match", id)!;
  const act = (id: string, type: GameAction["type"], extra: object = {}) => runtime.action("match", users[Number(id)], type === "open" ? { type, roomId: "match" } : { type, roomId: "match", sessionId: snap().sessionId, roundId: snap().roundId, revision: snap().revision, ...extra });
  assert.ok(act("0", "open").ok);
  for (let i = 0; i < count; i++) assert.ok(act(String(i), "join").ok);
  const advance = (ms: number) => { now += ms; runtime.tick(); };
  const round = (correct = true) => {
    const drawer = snap().drawerId!; assert.ok(act(drawer, "choose", { option: 0 }).ok);
    const word = snap(drawer).secretWord!;
    if (correct) for (const player of snap().players.filter((p) => p.online && p.id !== drawer)) assert.ok(act(player.id, "guess", { text: word }).ok);
    else advance(1000);
    assert.equal(snap().phase, "ROUND_RESULT"); advance(1100);
  };
  return { runtime, act, snap, advance, round, users };
}
test("match defaults, strict config authority, validation, stale revisions and lock", () => {
  const f = fixture(); assert.equal(f.snap().targetScore, 100); assert.equal(f.snap().theme, "general");
  const config = { targetScore: 150, theme: "animals" };
  assert.equal(f.act("1", "configure", config).ok, false);
  assert.equal(f.act("3", "configure", config).ok, false);
  const revision = f.snap().revision;
  assert.equal(f.act("0", "configure", config).ok, true);
  assert.equal(f.act("0", "configure", { targetScore: 50, theme: "food", revision }).ok, false);
  for (const targetScore of [0, -1, NaN, Infinity, 999999999, "50", 75]) assert.equal(f.act("0", "configure", { targetScore, theme: "general" }).ok, false);
  assert.equal(f.act("0", "configure", { targetScore: 100, theme: "unknown" }).ok, false);
  assert.equal(f.act("0", "configure", { ...config, sessionId: "old" }).ok, false);
  f.advance(1000); assert.ok(f.act("0", "start").ok);
  assert.equal(f.act("0", "configure", config).ok, false);
  assert.equal(f.snap("3").theme, "animals"); assert.equal(f.act("3", "join").ok, false);
  f.runtime.presence("match", "1", false); f.runtime.presence("match", "1", true);
  assert.equal(f.snap("1").targetScore, 150); assert.equal(f.snap("1").theme, "animals");
});
test("exact small score, order/time, drawer cap and client cannot supply score", () => {
  assert.equal(guessPoints(1, 0), 10); assert.equal(guessPoints(1, 1), 9);
  assert.equal(guessPoints(.001, 0), 6); assert.equal(guessPoints(.001, 2), 4);
  const f = fixture(8); f.act("0", "start"); f.act("0", "choose", { option: 0 });
  const word = f.snap().secretWord!;
  assert.equal(f.act("1", "guess", { text: word, score: 100 }).ok, false);
  assert.ok(f.act("1", "guess", { text: word }).ok); assert.equal(f.act("1", "guess", { text: word }).ok, false);
  assert.equal(f.snap().roundPoints?.["1"], 10);
  f.advance(999);
  for (let i = 2; i < 8; i++) assert.ok(f.act(String(i), "guess", { text: word }).ok);
  assert.equal(f.snap().roundPoints?.["2"], 5); assert.equal(f.snap().roundPoints?.["7"], 4);
  assert.equal(f.snap().roundPoints?.["0"], 6); assert.equal(f.snap().phase, "ROUND_RESULT");
  assert.equal(f.snap().players.some((p) => p.score >= 50), false);
});
test("three-player continuous rotations reach target only after resolved round; rematch lobby", () => {
  const f = fixture(); assert.ok(f.act("0", "configure", { targetScore: 50, theme: "food" }).ok); f.act("0", "start");
  const order = [];
  while (f.snap().phase !== "GAME_RESULT") { order.push(f.snap().drawerId); f.round(); assert.ok(order.length < 40); }
  assert.deepEqual(order.slice(0, 7), ["0", "1", "2", "0", "1", "2", "0"]);
  assert.ok(order.length > 6); assert.equal(f.snap().resultReason, "target");
  assert.ok(f.snap().players.some((p) => p.score >= 50)); assert.ok(f.snap().winnerIds.length >= 1);
  const session = f.snap().sessionId;
  assert.ok(f.act("0", "rematch").ok); assert.equal(f.snap().phase, "LOBBY");
  assert.equal(f.snap().sessionId, session); assert.equal(f.snap().theme, "food"); assert.equal(f.snap().targetScore, 50);
  assert.ok(f.snap().players.every((p) => p.score === 0)); assert.deepEqual(f.snap().winnerIds, []);
  assert.ok(f.act("0", "configure", { targetScore: 100, theme: "animals" }).ok);
  assert.ok(f.act("0", "start").ok); assert.equal(f.snap().round, 1);
});
test("fair finish waits for other guessers; ties share victory without socket tiebreak", () => {
  const f = fixture(3); f.act("0", "configure", { targetScore: 50, theme: "general" }); f.act("0", "start");
  // Equalize guess order across cycles using the server's own awarded scores.
  for (let r = 0; r < 6; r++) {
    const drawer = f.snap().drawerId!; f.act(drawer, "choose", { option: 0 });
    const word = f.snap(drawer).secretWord!;
    const ids = f.snap().players.filter((p) => p.id !== drawer).map((p) => p.id);
    if (r >= 3) ids.reverse();
    for (const id of ids) f.act(id, "guess", { text: word });
    f.advance(1100);
  }
  assert.deepEqual(f.snap().players.map((p) => p.score), [46, 46, 46]);
  const drawer = f.snap().drawerId!; f.act(drawer, "choose", { option: 0 }); const word = f.snap(drawer).secretWord!;
  f.act("1", "guess", { text: word }); assert.equal(f.snap().phase, "DRAWING"); assert.ok(f.snap().players[1].score >= 50);
  f.advance(250); // score 9 - order penalty 1 = 8; ensure two exceed target, deterministic higher wins.
  f.act("2", "guess", { text: word }); assert.equal(f.snap().phase, "ROUND_RESULT"); f.advance(100);
  assert.equal(f.snap().phase, "GAME_RESULT"); assert.deepEqual(f.snap().winnerIds, ["1"]);
  const tied = f.snap().players.map((p) => ({ ...p, score: p.id === "0" ? 20 : 55 }));
  assert.deepEqual(matchWinners(tied), ["1", "2"]);
  assert.deepEqual(matchWinners([...tied].reverse()).sort(), ["1", "2"]);
});
test("two players and 5/8 player matches reach targets; offline scans are bounded", () => {
  for (const count of [2, 5, 8]) {
    const f = fixture(count); f.act("0", "configure", { targetScore: 50, theme: "general" }); f.act("0", "start");
    let rounds = 0;
    while (f.snap().phase !== "GAME_RESULT") { f.round(); assert.ok(++rounds < 60); }
    assert.equal(f.snap().resultReason, "target"); assert.ok(rounds >= 5);
  }
  const f = fixture(3); f.act("0", "start"); f.runtime.presence("match", "0", false); f.advance(5000); f.advance(100);
  assert.equal(f.snap().drawerId, "1"); f.runtime.leave("match", "2"); f.round(false);
  assert.equal(f.snap().phase, "GAME_RESULT"); assert.equal(f.snap().resultReason, "insufficient_players"); assert.deepEqual(f.snap().winnerIds, []);
});
test("all original terms retained, themes private and repeated choices exclude used words until exhausted", () => {
  assert.ok(drawWords.every((word) => allDrawWords.includes(word)));
  assert.equal(new Set(allDrawWords.map(normalizeGuess)).size, allDrawWords.length);
  for (const theme of Object.keys(drawThemes).filter((id) => id !== "general") as (keyof typeof drawWordBanks)[]) {
    assert.ok(drawWordBanks[theme].length >= 28);
    const f = fixture(); f.act("0", "configure", { targetScore: 200, theme }); f.act("0", "start");
    const used = new Set<string>();
    for (let r = 0; r < drawWordBanks[theme].length + 2; r++) {
      const drawer = f.snap().drawerId!, choices = f.snap(drawer).choices!;
      assert.ok(choices.every((word) => drawWordBanks[theme].includes(word)));
      if (used.size === drawWordBanks[theme].length) used.clear();
      assert.ok(choices.every((word) => !used.has(word)));
      assert.equal(f.snap(String((Number(drawer) + 1) % 3)).choices, undefined);
      used.add(choices[0]); f.round(false);
    }
  }
  assert.equal(gameActionSchema.safeParse({ type: "choose", roomId: "a", sessionId: "s", roundId: "r", revision: 1, word: "cachorro", option: 0 }).success, false);
});
test("final score records survive leaving; rejoining an old record cannot exceed 12 active slots", () => {
  const f = fixture(3); f.act("0", "configure", { targetScore: 50, theme: "general" }); f.act("0", "start");
  while (f.snap().phase !== "GAME_RESULT") f.round();
  const before = f.snap(); f.runtime.leave("match", "2");
  assert.deepEqual(f.snap().winnerIds, before.winnerIds);
  assert.equal(f.snap().players.find((p) => p.id === "2")?.score, before.players[2].score);
  for (let i = 3; i < 13; i++) {
    const s = f.snap();
    assert.equal(f.runtime.action("match", { id: String(i), displayName: `Extra ${i}`, color: "#fff" }, { type: "join", roomId: "match", sessionId: s.sessionId, roundId: s.roundId, revision: s.revision }).ok, true);
  }
  assert.equal(f.act("2", "join").ok, false);
  f.advance(1000); assert.ok(f.act("0", "rematch").ok); assert.equal(f.snap().players.length, 12);
});
