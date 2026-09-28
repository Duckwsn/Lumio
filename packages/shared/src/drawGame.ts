import { z } from "zod";
export const drawColors = ["#26332c", "#faf8ef", "#69a982", "#cf615c", "#dbac54", "#658cc0", "#a181b1"] as const;
const id = z.string().min(1).max(100);
const point = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
const base = { roomId: id, sessionId: id, roundId: id, revision: z.number().int().nonnegative() };
export const gameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open"), roomId: id }).strict(),
  ...["sync", "join", "leave", "start", "rematch", "undo", "clear"].map((type) => z.object({ ...base, type: z.literal(type as "sync" | "join" | "leave" | "start" | "rematch" | "undo" | "clear") }).strict()),
  z.object({ ...base, type: z.literal("choose"), option: z.number().int().min(0).max(2) }).strict(),
  z.object({ ...base, type: z.literal("guess"), text: z.string().trim().min(1).max(80) }).strict(),
  z.object({ ...base, type: z.literal("stroke"), strokeId: id, offset: z.number().int().min(0).max(512), tool: z.enum(["brush", "eraser"]), color: z.enum(drawColors), width: z.number().min(.002).max(.05), points: z.array(point).min(1).max(32) }).strict(),
]);
export type GameAction = z.infer<typeof gameActionSchema>;
export type DrawPoint = z.infer<typeof point>;
export interface DrawStroke { id: string; tool: "brush" | "eraser"; color: string; width: number; points: DrawPoint[] }
export interface DrawPlayer { id: string; displayName: string; color: string; avatar?: string; score: number; online: boolean; guessed: boolean }
export type DrawPhase = "LOBBY" | "CHOOSING_WORD" | "DRAWING" | "ROUND_RESULT" | "GAME_RESULT";
export interface DrawSnapshot {
  sessionId: string; roomId: string; revision: number; boardRevision: number; roundId: string; phase: DrawPhase;
  hostId: string; players: DrawPlayer[]; order: string[]; drawerId: string | null; round: number; totalRounds: number;
  startedAt: number; endsAt: number; serverNow: number; maskedWord: string; revealedWord?: string;
  strokes: DrawStroke[]; feed: { id: number; text: string; createdAt?: number }[];
  /** Public, authoritative points earned in the current round. Never guess text. */
  roundPoints?: Record<string, number>;
  // Private projection on the same authenticated socket, NEVER room broadcast.
  choices?: string[]; secretWord?: string;
}
export interface DrawDelta { sessionId: string; roundId: string; boardRevision: number; stroke: DrawStroke; offset: number }
export type DrawState = Omit<DrawSnapshot, "strokes">;
export interface GameAck { ok: boolean; message?: string }
