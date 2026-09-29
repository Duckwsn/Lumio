import assert from "node:assert/strict";
import { createCardDeck } from "../../apps/server/src/cardDeck.js";
import type { GameCard } from "@lumio/shared";
export { shuffleCards } from "../../apps/server/src/cardDeck.js";

/** Isolated server-import fixture; all 96 physical cards preserved, no public debug API. */
export function freshCardDeck(): GameCard[] {
  const pool = createCardDeck();
  const num = (value: number, color: GameCard["color"] = "mint") => ({ kind: "number" as const, color, value });
  const take = (spec: { kind: GameCard["kind"]; color: GameCard["color"]; value?: number }) => { const i = pool.findIndex((c) => c.kind === spec.kind && c.color === spec.color && c.value === spec.value); assert.ok(i >= 0); return pool.splice(i, 1)[0]; };
  const hands = [
    [num(1), { kind: "draw_two" as const, color: "mint" as const }, { kind: "wild_draw" as const, color: null }, { kind: "wild" as const, color: null }, num(6, "tide"), { kind: "skip" as const, color: "tide" as const }, num(7, "tide")],
    [{ kind: "reverse" as const, color: "mint" as const }, num(1, "tide"), num(2, "tide"), num(3, "tide"), num(4, "tide"), num(6, "amber"), num(6, "plum")],
    [num(2), num(0, "tide"), num(1, "tide"), num(2, "tide"), num(3, "tide"), num(7, "amber"), num(7, "plum")],
  ].map((hand) => hand.map(take));
  const top = take(num(0));
  const draws = [num(0, "plum"), num(1, "plum"), num(2, "plum"), num(3, "plum"), num(4, "plum"), num(5, "plum"), num(6, "plum"), num(0, "amber"), num(4, "tide")].map(take);
  const deal: GameCard[] = []; for (let i = 0; i < 7; i++) for (const hand of hands) deal.push(hand[i]);
  return [top, ...pool, ...draws.reverse(), ...deal.reverse()];
}
