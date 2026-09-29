import assert from "node:assert/strict";
import test from "node:test";
import { PartyGames } from "./partyGames.js";
import type { GameType, User } from "@lumio/shared";

const users: User[] = ["a", "b", "c"].map((id) => ({ id, displayName: id, color: "#a5d9c1" }));
const types: GameType[] = ["draw", "quiz", "cards"];
function action(games: PartyGames, type: GameType, user: User, verb: string) {
  const s = games.snapshot("room", user.id)!;
  const payload = { type: verb, roomId: "room", ...(verb === "open" ? {} : { sessionId: s.sessionId, roundId: s.roundId, revision: s.revision }) };
  return games.action("room", user, type === "draw" ? { gameType: type, roomId: "room", action: payload } : { gameType: type, ...payload });
}
for (const type of types) {
  test(`G6 ${type}: absent lobby creator transfers after grace without joining`, () => {
    let now = 10000;
    const games = new PartyGames(() => {}, () => now);
    assert.ok(action(games, type, users[0], "open").ok);
    assert.ok(action(games, type, users[1], "join").ok);
    assert.ok(action(games, type, users[2], "join").ok);
    games.presence("room", "a", false);
    now += 4999; games.tick(); assert.equal(games.snapshot("room", "b")!.hostId, "a");
    now++; games.tick(); assert.equal(games.snapshot("room", "b")!.hostId, "b");
    assert.ok(action(games, type, users[1], "start").ok);
  });
  for (const other of types.filter((t) => t !== type)) {
    test(`G6 isolation ${type} rejects ${other} without changing session`, () => {
      const games = new PartyGames(() => {});
      assert.ok(action(games, type, users[0], "open").ok);
      const before = games.snapshot("room", "a")!;
      assert.equal(action(games, other, users[0], "open").ok, false);
      const after = games.snapshot("room", "a")!;
      assert.equal(after.sessionId, before.sessionId); assert.equal(after.revision, before.revision);
      assert.equal(after.gameType, type);
    });
  }
}
