import { endGameSchema, inspectGameSchema, drawEnvelopeSchema, gameActionSchema, quizActionSchema, type DrawDelta, type GameAck, type GameType, type PartyGameSnapshot, type User } from "@lumio/shared";
import { DrawGameRuntime } from "./drawGame.js";
import { QuizGameRuntime } from "./quizGame.js";

/** Routing and mutual exclusion only. Each game's rules remain in its runtime. */
export class PartyGames {
  private types = new Map<string, GameType>();
  private endingRates = new Map<string, number>();
  private inspectRates = new Map<string, number>();
  private draw: DrawGameRuntime;
  private quiz: QuizGameRuntime;
  constructor(private notify: (roomId: string, delta?: DrawDelta, full?: boolean) => void, private now = Date.now) {
    this.draw = new DrawGameRuntime((roomId, delta, full) => this.changed(roomId, "draw", delta, full), now);
    this.quiz = new QuizGameRuntime((roomId) => this.changed(roomId, "quiz"), now);
  }
  private changed(roomId: string, type: GameType, delta?: DrawDelta, full?: boolean) {
    if (this.types.get(roomId) !== type) return;
    if (!(type === "draw" ? this.draw.snapshot(roomId, "", false) : this.quiz.snapshot(roomId, ""))) this.types.delete(roomId);
    this.notify(roomId, delta, full);
  }
  snapshot(roomId: string, viewer: string, includeBoard = true): PartyGameSnapshot | null {
    if (this.types.get(roomId) === "quiz") return this.quiz.snapshot(roomId, viewer);
    const snapshot = this.types.get(roomId) === "draw" ? this.draw.snapshot(roomId, viewer, includeBoard) : null;
    return snapshot ? { ...snapshot, gameType: "draw" } : null;
  }
  boardStamp(roomId: string) { const state = this.snapshot(roomId, "", false); return state?.gameType === "draw" ? `draw:${this.draw.boardStamp(roomId)}` : state ? `quiz:${state.sessionId}:${state.revision}` : ""; }
  action(roomId: string, user: User, raw: unknown): GameAck {
    const inspect = inspectGameSchema.safeParse(raw);
    if (inspect.success) {
      if (inspect.data.roomId !== roomId) return { ok: false };
      const key = `${roomId}:${user.id}`; if ((this.inspectRates.get(key) ?? 0) > this.now()) return { ok: false, message: "Aguarde antes de consultar novamente." };
      this.inspectRates.set(key, this.now() + 500); this.notify(roomId, undefined, true); return { ok: true };
    }
    const end = endGameSchema.safeParse(raw);
    if (end.success) {
      const a = end.data, state = this.snapshot(roomId, user.id, false);
      if (a.roomId !== roomId || !state || a.gameType !== state.gameType || a.sessionId !== state.sessionId || a.roundId !== state.roundId || a.revision !== state.revision || state.hostId !== user.id) return { ok: false, message: "Só o coordenador pode encerrar a sessão atual." };
      const key = `${roomId}:${user.id}`, until = this.endingRates.get(key) ?? 0;
      if (until > this.now()) return { ok: false, message: "Aguarde antes de tentar novamente." };
      this.endingRates.set(key, this.now() + 1000); this.delete(roomId); return { ok: true };
    }
    // Legacy Draw actions keep their strict G3 schema; new Quiz actions explicitly
    // discriminate gameType. The selected session, not UI state, owns routing.
    const quiz = quizActionSchema.safeParse(raw), envelope = drawEnvelopeSchema.safeParse(raw);
    const draw = quiz.success ? null : gameActionSchema.safeParse(envelope.success ? envelope.data.action : raw);
    if (!quiz.success && !draw?.success) return { ok: false, message: "Ação de jogo inválida." };
    const a = quiz.success ? quiz.data : draw!.data!, type = quiz.success ? "quiz" : "draw";
    if (a.roomId !== roomId) return { ok: false, message: "Party inválida." };
    const current = this.types.get(roomId);
    if (current && current !== type) return { ok: false, message: `Há uma sessão de ${current === "draw" ? "Desenhe e Adivinhe" : "Quiz"}. Retorne a ela ou peça ao coordenador para encerrá-la.` };
    if (!current && a.type !== "open") return { ok: false, message: "Abra o jogo antes de participar." };
    if (!current) { if (this.types.size >= 1000) return { ok: false, message: "Jogos ocupados." }; this.types.set(roomId, type); }
    const ack = type === "quiz" ? this.quiz.action(roomId, user, a) : this.draw.action(roomId, user, a);
    if (!ack.ok && !current) this.types.delete(roomId);
    return ack;
  }
  presence(roomId: string, userId: string, online: boolean) { if (this.types.get(roomId) === "quiz") this.quiz.presence(roomId, userId, online); else this.draw.presence(roomId, userId, online); }
  leave(roomId: string, userId: string) { if (this.types.get(roomId) === "quiz") this.quiz.leave(roomId, userId); else this.draw.leave(roomId, userId); }
  tick() { this.draw.tick(); this.quiz.tick(); for (const rates of [this.endingRates, this.inspectRates]) for (const [key, until] of rates) if (until <= this.now()) rates.delete(key); }
  delete(roomId: string) { const type = this.types.get(roomId); this.types.delete(roomId); if (type === "quiz") this.quiz.delete(roomId); else this.draw.delete(roomId); this.notify(roomId); }
}
