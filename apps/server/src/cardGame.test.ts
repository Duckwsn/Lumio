import assert from "node:assert/strict";
import test from "node:test";
import { isCardLegal, cardActionSchema, type CardSnapshot, type GameCard, type User } from "@lumio/shared";
import { CardGameRuntime } from "./cardGame.js";
import { createCardDeck, shuffleCards } from "./cardDeck.js";
import { PartyGames } from "./partyGames.js";

type Spec = Pick<GameCard, "kind" | "color"> & { value?: number };
const number = (value: number, color: GameCard["color"] = "mint"): Spec => ({ kind: "number", color, value });
type Zones = { deck: GameCard[]; discard: GameCard[]; hands: Map<string, GameCard[]>; state: CardSnapshot; pending?: object };
function fixture(count = 3) {
  let now = 10000;
  const users: User[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), displayName: `Cards ${i}`, color: "#a5d9c1" }));
  let notifications = 0;
  const runtime = new CardGameRuntime(() => { notifications++; }, () => now, createCardDeck);
  const snap = (i = 0) => runtime.snapshot("room", String(i))!;
  const act = (i: number, type: string, extra: object = {}) => runtime.action("room", users[i], type === "open" ? { gameType: "cards", type, roomId: "room" } : { gameType: "cards", type, roomId: "room", sessionId: snap().sessionId, roundId: snap().roundId, revision: snap().revision, ...extra });
  act(0, "open"); for (let i = 0; i < count; i++) assert.ok(act(i, "join").ok);
  const zones = () => (runtime as unknown as { sessions: Map<string, Zones> }).sessions.get("room")!;
  const conserve = () => { const s = zones(), cards = [...s.deck, ...s.discard, ...[...s.hands.values()].flat()]; assert.equal(cards.length, 96); assert.equal(new Set(cards.map((c) => c.id)).size, 96); };
  // Unit-only arrangement of existing physical instances; never a socket action.
  const rig = (hands: Spec[][], top: Spec = number(0), draws: Spec[] = []) => {
    const s = zones(), pool = [...s.deck, ...s.discard, ...[...s.hands.values()].flat()];
    const take = (spec: Spec) => { const i = pool.findIndex((c) => c.kind === spec.kind && c.color === spec.color && c.value === spec.value); assert.ok(i >= 0, JSON.stringify(spec)); return pool.splice(i, 1)[0]; };
    s.discard = [take(top)]; s.hands = new Map(hands.map((hand, i) => [String(i), hand.map(take)])); const bought = draws.map(take); s.deck = [...pool, ...bought.reverse()]; delete s.pending;
    s.state.substate = "AWAITING_PLAY"; s.state.currentPlayerId = "0"; s.state.activeColor = top.color ?? "mint"; s.state.direction = 1;
    conserve();
  };
  const start = () => { assert.ok(act(0, "start").ok); conserve(); };
  const advance = (ms: number, tick = true) => { now += ms; if (tick) runtime.tick(); };
  const play = (i: number, index = 0, declareLast = true) => act(i, "play", { cardId: snap(i).myHand![index].id, declareLast });
  return { runtime, users, snap, act, zones, conserve, rig, start, advance, play, notifications: () => notifications };
}

test("long card matches conserve all physical cards across every authoritative transition", () => {
  for (const players of [2, 3, 4, 8]) {
    const f = fixture(players); f.start();
    for (let step = 0; step < 400; step++) {
      f.advance(1001, false); const s = f.snap();
      if (s.phase === "RESULT") { assert.ok(f.act(0, "rematch").ok); f.start(); continue; }
      const i = Number(s.currentPlayerId), own = f.snap(i);
      if (own.myPending?.kind === "wild") assert.ok(f.act(i, "choose_color", { color: "tide" }).ok);
      else if (own.legalCardIds?.length) assert.ok(f.act(i, own.myPending?.kind === "drawn" ? "play_drawn" : "play", { cardId: own.legalCardIds[0], declareLast: true }).ok);
      else assert.ok(f.act(i, "draw").ok);
      f.conserve();
      const publicState = f.snap(9); assert.equal(publicState.myHand, undefined);
      for (const p of publicState.players) assert.equal(p.cardCount, f.snap(Number(p.id)).myHand?.length ?? 0);
    }
  }
});
test("cards composition, opaque IDs, proper shuffle, seven-card deal and valid numeric top", () => {
  const deck = createCardDeck(); assert.equal(deck.length, 96); assert.equal(new Set(deck.map((c) => c.id)).size, 96);
  assert.equal(deck.filter((c) => c.kind === "number").length, 72); assert.equal(deck.filter((c) => c.kind === "wild").length, 8); assert.equal(deck.filter((c) => c.kind === "wild_draw").length, 4);
  for (const color of ["mint", "tide", "amber", "plum"]) { assert.equal(deck.filter((c) => c.color === color).length, 21); for (let n = 0; n <= 8; n++) assert.equal(deck.filter((c) => c.color === color && c.value === n).length, 2); }
  const shuffled = shuffleCards(deck); assert.deepEqual(new Set(shuffled.map((c) => c.id)), new Set(deck.map((c) => c.id))); assert.notDeepEqual(shuffled, deck); assert.equal(deck[0].value, 0);
  for (const players of [2, 3, 4, 8]) { const f = fixture(players); f.start(); for (let i = 0; i < players; i++) assert.equal(f.snap(i).myHand!.length, 7); assert.equal(f.snap().topCard?.kind, "number"); assert.equal(f.snap().drawCount, 96 - 7 * players - 1); }
});
test("cards private hands, spectator omission, own projections isolated even after mutations", () => {
  const f = fixture(); f.start();
  for (let viewer = 0; viewer < 4; viewer++) {
    const state = f.snap(viewer); assert.doesNotMatch(JSON.stringify(state), /"hands"|"deck"|seed|drawOrder/);
    if (viewer === 3) { assert.equal(state.myHand, undefined); assert.equal(state.legalCardIds, undefined); }
    else for (let other = 0; other < 3; other++) if (other !== viewer) for (const card of f.snap(other).myHand!) assert.ok(!JSON.stringify(state).includes(card.id));
  }
  f.snap().myHand!.pop(); assert.equal(f.snap().myHand!.length, 7);
  assert.equal(f.act(3, "join").ok, false); assert.equal(f.act(3, "draw").ok, false);
});
test("cards legality: color, number, action, wild; phase, ownership, revision and payload security", () => {
  const top = { ...number(4, "tide"), id: "top" };
  assert.ok(isCardLegal({ ...number(8, "tide"), id: "x" }, top, "tide")); assert.ok(isCardLegal({ ...number(4), id: "x" }, top, "tide"));
  assert.equal(isCardLegal({ ...number(8), id: "x" }, top, "tide"), false);
  assert.ok(isCardLegal({ id: "x", kind: "wild_draw", color: null }, top, "tide"));
  assert.ok(isCardLegal({ id: "x", kind: "skip", color: "plum" }, { id: "t", kind: "skip", color: "mint" }, "mint"));
  const f = fixture(); assert.equal(f.act(1, "start").ok, false); f.start(); f.rig([[number(3), number(8, "plum")], [number(2)], [number(6)]]);
  assert.equal(f.play(1).ok, false); assert.equal(f.act(0, "play", { cardId: f.snap(1).myHand![0].id, declareLast: true }).ok, false);
  assert.equal(f.act(0, "play", { cardId: "fake", declareLast: true }).ok, false); assert.equal(f.play(0, 1).ok, false);
  const old = f.snap(); assert.ok(f.play(0).ok); assert.equal(f.act(0, "draw", { revision: old.revision, roundId: old.roundId }).ok, false); f.conserve();
  assert.equal(cardActionSchema.safeParse({ gameType: "cards", type: "play", roomId: "room", sessionId: "s", roundId: "r", revision: 1, cardId: "x", declareLast: true, effect: "skip" }).success, false);
});
test("skip, reverse, draw_two and wild_draw resolve once for two, three and four players", () => {
  for (const count of [2, 3, 4]) for (const kind of ["skip", "reverse", "draw_two", "wild_draw"] as const) {
    const f = fixture(count); f.start(); const spec: Spec = { kind, color: kind === "wild_draw" ? null : "mint" };
    f.rig(Array.from({ length: count }, (_, i) => i === 0 ? [spec, number(8, "plum"), number(7, "plum")] : [number(i), number(i + 4)]));
    const before = f.snap(), card = f.snap().myHand![0]; assert.ok(f.play(0).ok);
    if (kind === "wild_draw") { assert.equal(f.snap().substate, "AWAITING_WILD_COLOR"); assert.equal(f.snap(1).myPending, undefined); assert.equal(f.act(0, "choose_color", { color: "fake" }).ok, false); assert.ok(f.act(0, "choose_color", { color: "tide" }).ok); assert.equal(f.snap().activeColor, "tide"); }
    const expected = kind === "reverse" ? count === 2 ? "0" : String(count - 1) : count === 2 ? "0" : "2";
    assert.equal(f.snap().currentPlayerId, expected);
    if (kind === "draw_two" || kind === "wild_draw") assert.equal(f.snap(1).myHand!.length, 2 + (kind === "draw_two" ? 2 : 4));
    if (kind === "reverse") assert.equal(f.snap().direction, -1);
    assert.equal(f.act(0, "play", { cardId: card.id, declareLast: true, revision: before.revision, roundId: before.roundId }).ok, false); f.conserve();
  }
});
test("voluntary draw: playable-only pending, pass/play, duplicate draw and no extra timeout purchase", () => {
  const f = fixture(); f.start(); f.rig([[number(3)], [number(1)], [number(6)]], number(0), [number(5)]);
  const old = f.snap(); assert.ok(f.act(0, "draw").ok); assert.equal(f.snap().substate, "AWAITING_DRAWN_CARD_DECISION"); const drawn = f.snap().myPending!.cardId;
  assert.equal(f.snap(1).myPending, undefined); assert.deepEqual(f.snap().legalCardIds, [drawn]); assert.equal(f.act(0, "draw").ok, false); assert.equal(f.play(0).ok, false);
  assert.equal(f.act(0, "draw", { revision: old.revision }).ok, false); assert.ok(f.act(0, "pass_drawn").ok); assert.equal(f.snap().currentPlayerId, "1"); f.conserve();
  const g = fixture(); g.start(); g.rig([[number(3)], [number(1)], [number(6)]], number(0), [number(5)]); g.act(0, "draw");
  assert.ok(g.act(0, "play_drawn", { cardId: g.snap().myPending!.cardId, declareLast: true }).ok); assert.equal(g.snap().players[0].declaredLast, true); g.conserve();
  const h = fixture(); h.start(); h.rig([[number(3)], [number(1)], [number(6)]], number(0), [number(5)]); h.act(0, "draw"); h.advance(35000); assert.equal(h.snap().players[0].cardCount, 2); assert.equal(h.snap().currentPlayerId, "1"); h.conserve();
  const u = fixture(); u.start(); u.rig([[number(3)], [number(1)], [number(6)]], number(0), [number(7, "plum")]); u.act(0, "draw"); assert.equal(u.snap().currentPlayerId, "1"); assert.equal(u.snap().players[0].cardCount, 2); u.conserve();
});
test("last-card declaration atomic boundary, automatic penalty, final numbers/actions/wild effects and rematch", () => {
  for (const declaration of [false, true]) { const f = fixture(); f.start(); f.rig([[number(3), number(7)], [number(2)], [number(4)]]); f.play(0, 0, declaration); assert.equal(f.snap().players[0].cardCount, declaration ? 1 : 3); assert.equal(f.snap().players[0].declaredLast, declaration); f.conserve(); }
  for (const kind of ["number", "skip", "reverse", "draw_two", "wild", "wild_draw"] as const) {
    const f = fixture(); f.start(); f.rig([[kind === "number" ? number(3) : { kind, color: kind === "wild" || kind === "wild_draw" ? null : "mint" }], [number(2)], [number(4)]]);
    assert.ok(f.play(0).ok); if (kind === "wild" || kind === "wild_draw") { assert.equal(f.snap().winnerId, undefined); f.act(0, "choose_color", { color: "amber" }); }
    assert.equal(f.snap().phase, "RESULT"); assert.equal(f.snap().winnerId, "0"); if (kind === "draw_two" || kind === "wild_draw") assert.equal(f.snap(1).myHand!.length, 1 + (kind === "draw_two" ? 2 : 4));
    assert.equal(f.act(0, "draw").ok, false); assert.equal(f.play(1).ok, false); f.conserve(); const sessionId = f.snap().sessionId; f.advance(1000); assert.ok(f.act(0, "rematch").ok); assert.equal(f.snap().phase, "LOBBY"); assert.equal(f.snap().sessionId, sessionId); assert.equal(f.snap().myHand, undefined); f.start(); assert.equal(f.snap().myHand!.length, 7);
  }
  const f = fixture(); f.start(); f.rig([[number(3), number(7)], [number(2)], [number(4)]]); f.advance(34999, false); assert.ok(f.play(0, 0, true).ok);
  const g = fixture(); g.start(); g.rig([[number(3), number(7)], [number(2)], [number(4)]]); g.advance(35000, false); assert.equal(g.play(0, 0, true).ok, false); g.runtime.tick(); assert.equal(g.snap().players[0].cardCount, 3); g.conserve();
});
test("wild private decision survives reconnect, timeout never plays, grace skips without destroying hands", () => {
  const f = fixture(); f.start(); f.rig([[{ kind: "wild", color: null }, number(3)], [number(2)], [number(4)]]); f.play(0);
  const hand = f.snap().myHand!, timer = f.snap().turnEndsAt; f.runtime.presence("room", "0", false); f.advance(4999); f.runtime.presence("room", "0", true);
  assert.deepEqual(f.snap().myHand, hand); assert.equal(f.snap().myPending?.kind, "wild"); assert.equal(f.snap().turnEndsAt, timer); f.runtime.presence("room", "0", false); f.advance(5000);
  assert.equal(f.snap().currentPlayerId, "1"); assert.equal(f.snap().players[0].cardCount, 3); assert.equal(f.snap().topCard?.kind, "number"); f.runtime.presence("room", "0", true); assert.equal(f.snap().myHand!.length, 3); assert.equal(f.snap().hostId, "1"); f.conserve();
  f.runtime.leave("room", "2"); f.conserve(); f.runtime.leave("room", "0"); f.conserve(); assert.equal(f.snap(0).myHand, undefined); assert.equal(f.snap().resultReason, "insufficient_players");
});
test("deck exhaustion preserves top, recycles discard once, handles zero available without inventing cards", () => {
  const f = fixture(); f.start(); const s = f.zones(), top = s.discard.at(-1)!;
  s.discard = [...s.deck, ...s.discard]; s.deck = []; const before = f.snap().myHand!.length;
  f.act(0, "draw"); assert.equal(f.snap().myHand!.length, before + 1); assert.equal(f.snap().topCard!.id, top.id); f.conserve();
  const g = fixture(2); g.start(); const z = g.zones(); z.hands.get("1")!.push(...z.deck); z.deck = []; g.conserve(); const n = g.snap().myHand!.length; g.act(0, "draw"); assert.equal(g.snap().players[0].cardCount, n); assert.equal(g.snap().currentPlayerId, "1"); g.conserve();
});
test("capacity, cleanup, throttle and Cards prevent both other game sessions", () => {
  const f = fixture(8); assert.equal(f.act(8, "join").ok, false); f.advance(30 * 60000 + 1); assert.equal(f.runtime.snapshot("room", "0"), null);
  const g = fixture(2); let denied = false; for (let i = 0; i < 12; i++) if (!g.act(0, "sync").ok) denied = true; assert.ok(denied);
  const games = new PartyGames(() => {}); assert.ok(games.action("room", f.users[0], { gameType: "cards", type: "open", roomId: "room" }).ok);
  assert.equal(games.action("room", f.users[0], { gameType: "quiz", type: "open", roomId: "room" }).ok, false); assert.equal(games.action("room", f.users[0], { type: "open", roomId: "room" }).ok, false);
  games.delete("room"); assert.equal(games.snapshot("room", "0"), null);
});
