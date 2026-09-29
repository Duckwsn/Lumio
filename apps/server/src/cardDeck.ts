import crypto from "node:crypto";
import { cardColors, type GameCard, type CardColor } from "@lumio/shared";

export function shuffleCards<T>(cards: readonly T[]): T[] {
  const result = [...cards]; for (let i = result.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result;
}
/** 72 numbers + 12 colored actions + 12 wilds. IDs encode no card property. */
export function createCardDeck(): GameCard[] {
  const cards: GameCard[] = [];
  for (const color of Object.keys(cardColors) as CardColor[]) {
    for (let value = 0; value <= 8; value++) for (let copy = 0; copy < 2; copy++) cards.push({ id: crypto.randomUUID(), kind: "number", color, value });
    for (const kind of ["skip", "reverse", "draw_two"] as const) cards.push({ id: crypto.randomUUID(), kind, color });
  }
  for (let i = 0; i < 8; i++) cards.push({ id: crypto.randomUUID(), kind: "wild", color: null });
  for (let i = 0; i < 4; i++) cards.push({ id: crypto.randomUUID(), kind: "wild_draw", color: null });
  return cards;
}
export const freshCardDeck = () => shuffleCards(createCardDeck());
