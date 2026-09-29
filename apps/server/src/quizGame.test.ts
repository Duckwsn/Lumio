import assert from "node:assert/strict";
import test from "node:test";
import type { QuizAction, User } from "@lumio/shared";
import { QuizGameRuntime, quizPoints } from "./quizGame.js";
import { questionSchema, quizQuestions } from "./quizQuestions.js";
import { PartyGames } from "./partyGames.js";

function fixture(count = 3) {
  let now = 10000;
  const users: User[] = Array.from({ length: 14 }, (_, i) => ({ id: String(i), displayName: `Quiz ${i}`, color: "#69a982" }));
  const runtime = new QuizGameRuntime(() => {}, () => now);
  const snap = (i = 0) => runtime.snapshot("room", String(i))!;
  const act = (i: number, type: QuizAction["type"], extra: object = {}) => runtime.action("room", users[i], type === "open" ? { gameType: "quiz", type, roomId: "room" } : { gameType: "quiz", type, roomId: "room", sessionId: snap().sessionId, roundId: snap().roundId, revision: snap().revision, ...extra });
  assert.ok(act(0, "open").ok); for (let i = 0; i < count; i++) assert.ok(act(i, "join").ok);
  const advance = (ms: number, tick = true) => { now += ms; if (tick) runtime.tick(); };
  const correct = () => { const q = quizQuestions.find((q) => q.prompt === snap().question!.prompt)!; return snap().question!.answers.indexOf(q.answers[q.correctIndex]); };
  return { users, runtime, snap, act, advance, correct };
}
test("quiz bank: 150 original unique prompts, four distinct alternatives, all category/difficulty combinations cover 20", () => {
  assert.equal(quizQuestions.length, 150);
  const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  assert.equal(new Set(quizQuestions.map((q) => q.id)).size, 150);
  assert.equal(new Set(quizQuestions.map((q) => normalized(q.prompt))).size, 150);
  for (const q of quizQuestions) {
    assert.ok(questionSchema.safeParse(q).success); assert.equal(new Set(q.answers.map(normalized)).size, 4); assert.ok(q.answers[q.correctIndex]);
    for (const text of [q.prompt, ...q.answers]) assert.doesNotMatch(text, /<[^>]*>/);
  }
  for (const category of ["science", "math"]) for (const difficulty of ["easy", "medium", "hard"]) assert.equal(quizQuestions.filter((q) => q.category === category && q.difficulty === difficulty).length, 25);
});
test("quiz strict config, host/participation, allowlists, stale state and phase lock", () => {
  const f = fixture(); const config = { questionCount: 5, category: "science", difficulty: "easy" };
  assert.equal(f.snap().questionCount, 10); assert.equal(f.act(1, "configure", config).ok, false); assert.equal(f.act(3, "configure", config).ok, false);
  const oldRevision = f.snap().revision; assert.ok(f.act(0, "configure", config).ok);
  assert.equal(f.act(0, "configure", { ...config, revision: oldRevision }).ok, false);
  for (const extra of [{ questionCount: 999 }, { category: "fake" }, { difficulty: "fake" }, { score: 99 }]) { f.advance(1000); assert.equal(f.act(0, "configure", { ...config, ...extra }).ok, false); }
  f.advance(1000); assert.equal(f.act(1, "start").ok, false); assert.ok(f.act(0, "start").ok); assert.equal(f.act(0, "configure", config).ok, false); assert.equal(f.act(3, "join").ok, false);
});
test("quiz private projection, own lock, no score/correctness before reveal, shared order and early finish", () => {
  const f = fixture(); assert.ok(f.act(0, "start").ok); const correct = f.correct(); const revision = f.snap().revision;
  assert.deepEqual(f.snap(0).question, f.snap(1).question);
  assert.ok(f.act(0, "answer", { option: correct }).ok); assert.equal(f.snap().ownAnswer, correct); assert.equal(f.snap().players[0].score, 0);
  assert.equal(f.act(0, "answer", { option: (correct + 1) % 4 }).ok, false);
  f.runtime.presence("room", "0", false); f.runtime.presence("room", "0", true); assert.equal(f.snap().ownAnswer, correct);
  for (const viewer of [1, 2, 3]) { const s = f.snap(viewer); assert.equal(s.ownAnswer, undefined); assert.doesNotMatch(JSON.stringify(s), /correctIndex|correctAnswer|ownCorrect|ownPoints|distribution|explanation|deck/); }
  f.advance(1000, false); assert.equal(f.act(1, "answer", { option: correct, score: 999 }).ok, false);
  assert.ok(f.act(1, "answer", { option: correct, revision }).ok); assert.equal(f.snap().phase, "QUESTION");
  assert.ok(f.act(2, "answer", { option: (correct + 1) % 4, revision }).ok); assert.equal(f.snap().phase, "REVEAL");
  assert.equal(f.snap().reveal?.correctIndex, correct); assert.equal(f.snap().reveal?.distribution.reduce((a, b) => a + b), 3);
  assert.equal(f.snap(0).reveal?.ownPoints, 9); assert.equal(f.snap(1).reveal?.ownPoints, 8); assert.equal(f.snap(2).reveal?.ownPoints, 0);
  f.runtime.tick(); assert.equal(f.snap().players[0].score, 9);
});
test("quiz deadline before tick, clock score, stale question and offline spectators never block", () => {
  assert.equal(quizPoints(1), 9); assert.equal(quizPoints(.001), 6); assert.equal(quizPoints(.5), 7);
  const f = fixture(); f.act(0, "start"); const old = f.snap(); f.advance(14999, false);
  assert.ok(f.act(0, "answer", { option: f.correct() }).ok); f.advance(1, false); assert.equal(f.act(1, "answer", { option: 0 }).ok, false); f.runtime.tick(); assert.equal(f.snap().phase, "REVEAL"); assert.equal(f.snap().players[0].score, 6);
  f.advance(6000); assert.equal(f.act(1, "answer", { option: 0, roundId: old.roundId }).ok, false);
  f.act(0, "answer", { option: 0 }); f.act(1, "answer", { option: 1 }); f.runtime.presence("room", "2", false);
  assert.equal(f.snap().phase, "REVEAL"); assert.equal(f.snap(3).ownAnswer, undefined);
});
test("quiz full five-question match, uniqueness, winner ties, reveal dwell and rematch reset", () => {
  const f = fixture(2); assert.ok(f.act(0, "configure", { questionCount: 5, category: "math", difficulty: "hard" }).ok); assert.ok(f.act(0, "start").ok);
  const prompts = new Set<string>(), sessionId = f.snap().sessionId;
  for (let round = 1; round <= 5; round++) {
    assert.equal(f.snap().round, round); assert.equal(f.snap().phase, "QUESTION"); prompts.add(f.snap().question!.prompt);
    const correct = f.correct(); f.act(0, "answer", { option: correct }); f.act(1, "answer", { option: correct });
    assert.equal(f.snap().phase, "REVEAL"); f.advance(5999); assert.equal(f.snap().phase, "REVEAL"); f.advance(1);
  }
  assert.equal(prompts.size, 5); assert.equal(f.snap().phase, "RESULT"); assert.deepEqual(f.snap().winnerIds, ["0", "1"]); assert.equal(f.snap().players[0].score, 45);
  assert.ok(f.act(0, "rematch").ok); assert.equal(f.snap().phase, "LOBBY"); assert.equal(f.snap().sessionId, sessionId); assert.equal(f.snap().category, "math"); assert.equal(f.snap().difficulty, "hard"); assert.equal(f.snap().questionCount, 5); assert.equal(f.snap().round, 0); assert.ok(f.snap().players.every((p) => p.score === 0 && p.correctCount === 0)); assert.equal(f.snap().question, undefined);
});
test("quiz limits, coordinator transfer, disconnect grace and insufficient players", () => {
  const f = fixture(12); assert.equal(f.act(12, "join").ok, false); f.act(0, "start");
  f.runtime.presence("room", "1", false); f.advance(4999); f.runtime.presence("room", "1", true); assert.ok(f.act(1, "answer", { option: 0 }).ok);
  f.runtime.leave("room", "0"); assert.equal(f.snap().hostId, "1");
  for (let i = 2; i < 12; i++) f.runtime.leave("room", String(i)); assert.equal(f.snap().phase, "REVEAL"); f.advance(6000); assert.equal(f.snap().resultReason, "insufficient_players"); assert.deepEqual(f.snap().winnerIds, []);
});
test("mixed quiz guarantees three difficulty levels without repeats, and control spam is bounded", () => {
  const f = fixture(2); f.act(0, "configure", { questionCount: 5, category: "science", difficulty: "mixed" }); f.act(0, "start");
  const levels = new Set<string>(), prompts = new Set<string>();
  for (let i = 0; i < 5; i++) { const prompt = f.snap().question!.prompt; prompts.add(prompt); levels.add(quizQuestions.find((q) => q.prompt === prompt)!.difficulty); f.act(0, "answer", { option: 0 }); f.act(1, "answer", { option: 0 }); f.advance(6000); }
  assert.equal(levels.size, 3); assert.equal(prompts.size, 5);
  f.act(0, "rematch"); let blocked = false; for (let i = 0; i < 12; i++) if (!f.act(0, "sync").ok) blocked = true; assert.ok(blocked);
});
test("party game mutual exclusion, inspect is read-only, explicit authorized end and stale end refusal", () => {
  let now = 10000; const games = new PartyGames(() => {}, () => now), a = { id: "a", displayName: "A", color: "#fff" }, b = { ...a, id: "b" };
  assert.ok(games.action("room", a, { type: "inspect", roomId: "room" }).ok); assert.equal(games.snapshot("room", "a"), null);
  assert.equal(games.action("room", a, { gameType: "draw", roomId: "room", action: { type: "open", roomId: "other" } }).ok, false);
  assert.ok(games.action("room", a, { gameType: "draw", roomId: "room", action: { type: "open", roomId: "room" } }).ok); const state = games.snapshot("room", "a")!;
  assert.equal(state.gameType, "draw"); assert.equal(games.action("room", b, { type: "open", gameType: "quiz", roomId: "room" }).ok, false);
  const end = { type: "end", gameType: "draw", roomId: "room", sessionId: state.sessionId, roundId: state.roundId, revision: state.revision };
  assert.equal(games.action("room", b, end).ok, false); assert.equal(games.action("room", a, { ...end, revision: 999 }).ok, false);
  assert.ok(games.action("room", a, end).ok); now += 1000;
  assert.ok(games.action("room", a, { type: "open", gameType: "quiz", roomId: "room" }).ok); assert.equal(games.snapshot("room", "b")?.gameType, "quiz"); assert.equal(games.action("room", a, { type: "open", roomId: "room" }).ok, false);
});
