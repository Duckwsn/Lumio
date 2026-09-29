import { z } from "zod";

export const cardColors = { mint: { label: "Menta", mark: "●" }, tide: { label: "Maré", mark: "◆" }, amber: { label: "Âmbar", mark: "▲" }, plum: { label: "Ameixa", mark: "■" } } as const;
export type CardColor = keyof typeof cardColors;
export const cardKinds = { number: "Número", skip: "Pular", reverse: "Virar", draw_two: "Comprar 2", wild: "Mudar cor", wild_draw: "Mudar +4" } as const;
export type CardKind = keyof typeof cardKinds;
export interface GameCard { id: string; kind: CardKind; color: CardColor | null; value?: number }
export const cardLabel = (card: GameCard) => `${card.color ? cardColors[card.color].label + " " : ""}${card.kind === "number" ? card.value : cardKinds[card.kind]}`;
export const isCardLegal = (card: GameCard, top: GameCard, color: CardColor) => card.color === null || card.color === color || (card.kind === "number" && top.kind === "number" ? card.value === top.value : card.kind !== "number" && card.kind === top.kind);
const id = z.string().min(1).max(100);
const base = { gameType: z.literal("cards"), roomId: id, sessionId: id, roundId: id, revision: z.number().int().nonnegative() };
export const cardActionSchema = z.discriminatedUnion("type", [
  z.object({ gameType: z.literal("cards"), type: z.literal("open"), roomId: id }).strict(),
  ...["sync", "join", "leave", "start", "rematch", "draw", "pass_drawn"].map((type) => z.object({ ...base, type: z.literal(type as "sync" | "join" | "leave" | "start" | "rematch" | "draw" | "pass_drawn") }).strict()),
  z.object({ ...base, type: z.literal("play"), cardId: id, declareLast: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal("play_drawn"), cardId: id, declareLast: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal("choose_color"), color: z.enum(["mint", "tide", "amber", "plum"]) }).strict(),
]);
export type CardAction = z.infer<typeof cardActionSchema>;
export interface CardPlayer { id: string; displayName: string; color: string; avatar?: string; online: boolean; participating: boolean; cardCount: number; declaredLast: boolean }
export interface CardSnapshot {
  gameType: "cards"; roomId: string; sessionId: string; roundId: string; revision: number; hostId: string;
  phase: "LOBBY" | "PLAYING" | "RESULT"; players: CardPlayer[]; turnOrder: string[]; currentPlayerId: string;
  direction: 1 | -1; activeColor: CardColor; topCard?: GameCard; drawCount: number;
  substate: "AWAITING_PLAY" | "AWAITING_WILD_COLOR" | "AWAITING_DRAWN_CARD_DECISION";
  turnStartedAt: number; turnEndsAt: number; serverNow: number; winnerId?: string;
  resultReason?: "empty_hand" | "insufficient_players";
  feed: { id: string; text: string }[];
  myHand?: GameCard[]; legalCardIds?: string[]; myPending?: { kind: "wild" | "drawn"; cardId: string };
}
