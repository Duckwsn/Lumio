import assert from "node:assert/strict";
import test from "node:test";
import { isDrawingUndo } from "./drawingShortcut";
import { canGuess, gamePresentationRole } from "./PartyGameChat";
const key = { key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false };
test("drawing undo requires drawer/DRAWING and preserves native editing and overlays", () => {
  assert.equal(isDrawingUndo(key, true, false, false), true);
  assert.equal(isDrawingUndo({ ...key, ctrlKey: false, metaKey: true }, true, false, false), true);
  for (const [enabled, editing, overlay] of [[false, false, false], [true, true, false], [true, false, true]]) assert.equal(isDrawingUndo(key, enabled, editing, overlay), false);
  for (const change of [{ shiftKey: true }, { altKey: true }, { repeat: true }, { defaultPrevented: true }, { key: "x" }, { ctrlKey: false }]) assert.equal(isDrawingUndo({ ...key, ...change }, true, false, false), false);
});
test("game-aware chat eligibility excludes drawer, spectator, offline and already-correct player", () => {
  const game = { phase: "DRAWING" as const, drawerId: "a", players: ["a", "b", "c"].map((id) => ({ id, displayName: id, color: "#fff", online: true, score: 0, guessed: false })) };
  assert.equal(canGuess(game, "b"), true); assert.equal(canGuess(game, "a"), false); assert.equal(canGuess(game, "spectator"), false);
  game.players[1].guessed = true; assert.equal(canGuess(game, "b"), false);
  game.players[2].online = false; assert.equal(canGuess(game, "c"), false);
  assert.equal(canGuess({ ...game, phase: "ROUND_RESULT" }, "b"), false);
  assert.equal(canGuess(null, "b"), false);
});
test("role layout hides only the active drawer presentation and restores on results/media", () => {
  const game = { phase: "DRAWING" as const, drawerId: "a", players: [{ id: "a", displayName: "Ana", color: "#fff", online: true, score: 0, guessed: false }] };
  assert.equal(gamePresentationRole(game, true, "a"), "drawer");
  assert.equal(gamePresentationRole(game, true, "b"), "guesser");
  assert.equal(gamePresentationRole(game, false, "a"), "neutral");
  assert.equal(gamePresentationRole({ ...game, phase: "ROUND_RESULT" }, true, "a"), "neutral");
  assert.equal(gamePresentationRole({ ...game, phase: "CHOOSING_WORD" }, true, "a"), "drawer");
});
