import { z } from "zod";
import { gameActionSchema, type DrawSnapshot, type DrawState, type GameAction } from "./drawGame.js";
import type { CardAction, CardSnapshot } from "./cardGame.js";

export const gameRegistry = [
  { id: "draw", name: "Desenhe e Adivinhe", minPlayers: 2, maxPlayers: 12 },
  { id: "quiz", name: "Quiz", minPlayers: 2, maxPlayers: 12 },
  { id: "cards", name: "Lumio Cartas", minPlayers: 2, maxPlayers: 8 },
] as const;
export type GameType = typeof gameRegistry[number]["id"];
export const quizCategories = { general: "Geral", science: "Ciências", math: "Matemática" } as const;
export const quizDifficulties = { mixed: "Misto", easy: "Fácil", medium: "Médio", hard: "Difícil" } as const;
export const quizCounts = [5, 10, 15, 20] as const;
export type QuizCategory = keyof typeof quizCategories;
export type QuizDifficulty = keyof typeof quizDifficulties;
const id = z.string().min(1).max(100);
const base = { gameType: z.literal("quiz"), roomId: id, sessionId: id, roundId: id, revision: z.number().int().nonnegative() };
export const quizActionSchema = z.discriminatedUnion("type", [
  z.object({ gameType: z.literal("quiz"), type: z.literal("open"), roomId: id }).strict(),
  ...["sync", "join", "leave", "start", "rematch"].map((type) => z.object({ ...base, type: z.literal(type as "sync" | "join" | "leave" | "start" | "rematch") }).strict()),
  z.object({ ...base, type: z.literal("configure"), questionCount: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]), category: z.enum(["general", "science", "math"]), difficulty: z.enum(["mixed", "easy", "medium", "hard"]) }).strict(),
  z.object({ ...base, type: z.literal("answer"), option: z.number().int().min(0).max(3) }).strict(),
]);
export const endGameSchema = z.object({ type: z.literal("end"), gameType: z.enum(["draw", "quiz", "cards"]), roomId: id, sessionId: id, roundId: id, revision: z.number().int().nonnegative() }).strict();
export type QuizAction = z.infer<typeof quizActionSchema>;
export const inspectGameSchema = z.object({ type: z.literal("inspect"), roomId: id }).strict();
export const drawEnvelopeSchema = z.object({ gameType: z.literal("draw"), roomId: id, action: gameActionSchema }).strict().refine((value) => value.roomId === value.action.roomId, "Party divergente.");
export type PartyGameAction = GameAction | z.infer<typeof drawEnvelopeSchema> | QuizAction | CardAction | z.infer<typeof endGameSchema> | z.infer<typeof inspectGameSchema>;
export interface QuizPlayer { id: string; displayName: string; color: string; avatar?: string; score: number; correctCount: number; online: boolean }
export interface QuizSnapshot {
  gameType: "quiz"; roomId: string; sessionId: string; roundId: string; revision: number;
  hostId: string; phase: "LOBBY" | "QUESTION" | "REVEAL" | "RESULT";
  players: QuizPlayer[]; questionCount: number; category: QuizCategory; difficulty: QuizDifficulty;
  round: number; startedAt: number; endsAt: number; serverNow: number;
  question?: { prompt: string; answers: string[] };
  answeredCount: number; eligibleCount: number; ownAnswer?: number;
  reveal?: { correctIndex: number; distribution: number[]; ownPoints: number; ownCorrect: boolean };
  winnerIds: string[]; resultReason?: "completed" | "insufficient_players";
}
export type PartyGameSnapshot = (DrawSnapshot & { gameType: "draw" }) | QuizSnapshot | CardSnapshot;
export type PartyGameState = (DrawState & { gameType: "draw" }) | QuizSnapshot | CardSnapshot;
