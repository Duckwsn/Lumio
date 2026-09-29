import crypto from "node:crypto";
import { quizActionSchema, type QuizSnapshot, type GameAck, type User } from "@lumio/shared";
import { quizQuestions, type QuizQuestion } from "./quizQuestions.js";

type Answer = { option: number; points: number };
type Session = { public: QuizSnapshot; active: Set<string>; offline: Map<string, number>; deck: QuizQuestion[]; correctIndex: number; answers: Map<string, Answer>; touched: number };
export const quizPoints = (remaining: number) => 6 + Math.floor(3 * Math.max(0, Math.min(1, remaining)));
const shuffled = <T>(items: readonly T[]) => { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; };

export class QuizGameRuntime {
  private sessions = new Map<string, Session>();
  private rates = new Map<string, { count: number; until: number }>();
  constructor(private notify: (roomId: string) => void, private now = Date.now, private durations = { question: 15000, reveal: 6000 }, private bank = quizQuestions) {}
  snapshot(roomId: string, viewer: string): QuizSnapshot | null {
    const s = this.sessions.get(roomId); if (!s) return null;
    const eligible = s.public.players.filter((p) => s.active.has(p.id) && p.online);
    const own = s.answers.get(viewer);
    // Explicit safe projection: no spread of private session, deck or answer map.
    const projected: QuizSnapshot = { ...s.public, serverNow: this.now(), eligibleCount: eligible.length, answeredCount: eligible.filter((p) => s.answers.has(p.id)).length };
    if (own && (projected.phase === "QUESTION" || projected.phase === "REVEAL")) projected.ownAnswer = own.option;
    if (projected.phase === "REVEAL") projected.reveal = { correctIndex: s.correctIndex, distribution: [0, 1, 2, 3].map((option) => [...s.answers.values()].filter((answer) => answer.option === option).length), ownPoints: own?.points ?? 0, ownCorrect: own?.option === s.correctIndex };
    return structuredClone(projected);
  }
  private phase(s: Session, phase: QuizSnapshot["phase"], duration = 0) { s.public.phase = phase; s.public.startedAt = this.now(); s.public.endsAt = duration ? this.now() + duration : 0; s.public.revision++; s.touched = this.now(); }
  private finish(s: Session) {
    if (s.public.phase !== "QUESTION") return;
    for (const p of s.public.players) { const answer = s.answers.get(p.id); if (answer) { p.score += answer.points; if (answer.option === s.correctIndex) p.correctCount++; } }
    this.phase(s, "REVEAL", this.durations.reveal);
  }
  private early(s: Session) { const online = s.public.players.filter((p) => s.active.has(p.id) && p.online); if (s.public.phase === "QUESTION" && online.every((p) => s.answers.has(p.id))) this.finish(s); }
  private next(s: Session) {
    const p = s.public;
    if (p.round >= p.questionCount || p.players.filter((player) => s.active.has(player.id) && player.online).length < 2) {
      p.resultReason = p.round >= p.questionCount ? "completed" : "insufficient_players";
      const top = Math.max(0, ...p.players.map((player) => player.score));
      p.winnerIds = p.resultReason === "completed" ? p.players.filter((player) => player.score === top).map((player) => player.id) : [];
      delete p.question; s.answers.clear(); this.phase(s, "RESULT"); return;
    }
    const q = s.deck[p.round];
    const order = shuffled([0, 1, 2, 3]); s.correctIndex = order.indexOf(q.correctIndex);
    p.question = { prompt: q.prompt, answers: order.map((i) => q.answers[i]) };
    p.round++; p.roundId = crypto.randomUUID(); s.answers.clear(); this.phase(s, "QUESTION", this.durations.question);
  }
  action(roomId: string, user: User, raw: unknown): GameAck {
    const parsed = quizActionSchema.safeParse(raw); if (!parsed.success || parsed.data.roomId !== roomId) return { ok: false, message: "Ação de Quiz inválida." };
    const a = parsed.data, time = this.now(), key = `${roomId}:${user.id}`;
    const rate = this.rates.get(key); if (rate && rate.until > time && rate.count >= 8) return { ok: false, message: "Aguarde antes de tentar novamente." };
    this.rates.set(key, rate && rate.until > time ? { ...rate, count: rate.count + 1 } : { count: 1, until: time + 1000 });
    let s = this.sessions.get(roomId);
    if (a.type === "open") {
      if (!s) {
        if (this.sessions.size >= 1000) return { ok: false, message: "Jogos ocupados." };
        s = { public: { gameType: "quiz", roomId, sessionId: crypto.randomUUID(), roundId: "lobby", revision: 1, hostId: user.id, phase: "LOBBY", players: [], questionCount: 10, category: "general", difficulty: "mixed", round: 0, startedAt: time, endsAt: 0, serverNow: time, answeredCount: 0, eligibleCount: 0, winnerIds: [] }, active: new Set(), offline: new Map(), deck: [], correctIndex: -1, answers: new Map(), touched: time };
        this.sessions.set(roomId, s);
      }
      this.notify(roomId); return { ok: true };
    }
    if (!s || a.sessionId !== s.public.sessionId || a.roundId !== s.public.roundId || a.revision > s.public.revision) return { ok: false, message: "Sessão mudou. Atualize o jogo." };
    const p = s.public, me = p.players.find((player) => player.id === user.id);
    if (a.type === "sync") { this.notify(roomId); return { ok: true }; }
    if (["configure", "start", "rematch"].includes(a.type) && a.revision !== p.revision) return { ok: false, message: "Estado mudou. Tente novamente." };
    s.touched = time;
    if (a.type === "join") {
      if (p.phase !== "LOBBY" && p.phase !== "RESULT") return { ok: false, message: "Observe esta partida; participe na próxima." };
      if (!s.active.has(user.id) && s.active.size >= 12) return { ok: false, message: "Limite de 12 jogadores." };
      if (!me) p.players.push({ id: user.id, displayName: user.displayName, color: user.color, avatar: user.avatar, score: 0, correctCount: 0, online: true }); else me.online = true;
      s.active.add(user.id); s.offline.delete(user.id); if (!p.hostId) p.hostId = user.id; p.revision++;
    } else if (a.type === "leave") { this.leave(roomId, user.id); return { ok: true }; }
    else if (a.type === "configure") {
      if (p.hostId !== user.id || !me?.online || !s.active.has(user.id) || p.phase !== "LOBBY") return { ok: false, message: "Só o coordenador participante configura no lobby." };
      const pool = this.bank.filter((q) => (a.category === "general" || q.category === a.category) && (a.difficulty === "mixed" || q.difficulty === a.difficulty));
      if (pool.length < a.questionCount) return { ok: false, message: "Não há perguntas suficientes para esta configuração." };
      p.questionCount = a.questionCount; p.category = a.category; p.difficulty = a.difficulty; p.revision++;
    } else if (a.type === "start" || a.type === "rematch") {
      if (p.hostId !== user.id || !me?.online || !s.active.has(user.id) || !(a.type === "start" && p.phase === "LOBBY" || a.type === "rematch" && p.phase === "RESULT")) return { ok: false, message: "Somente o coordenador inicia." };
      const online = p.players.filter((player) => s!.active.has(player.id) && player.online);
      if (online.length < 2) return { ok: false, message: "Precisamos de pelo menos duas pessoas." };
      const pool = this.bank.filter((q) => (p.category === "general" || q.category === p.category) && (p.difficulty === "mixed" || q.difficulty === p.difficulty));
      if (pool.length < p.questionCount) return { ok: false, message: "Banco insuficiente." };
      // Mixed guarantees all three levels even in five-question matches.
      if (p.difficulty === "mixed") {
        const levels = shuffled(["easy", "medium", "hard"] as const);
        const buckets = levels.map((level) => shuffled(pool.filter((q) => q.difficulty === level)));
        const chosen: QuizQuestion[] = [];
        for (let i = 0; i < p.questionCount; i++) { const q = buckets[i % 3].pop(); if (!q) return { ok: false, message: "Banco insuficiente por dificuldade." }; chosen.push(q); }
        s.deck = shuffled(chosen);
      } else s.deck = shuffled(pool).slice(0, p.questionCount);
      s.active = new Set(online.map((player) => player.id)); s.offline.clear();
      p.players = online; p.players.forEach((player) => { player.score = 0; player.correctCount = 0; }); p.round = 0; p.winnerIds = []; delete p.resultReason; delete p.question; s.answers.clear();
      if (a.type === "rematch") { p.roundId = crypto.randomUUID(); this.phase(s, "LOBBY"); } else this.next(s);
    } else if (a.type === "answer") {
      // Non-future revisions are safe for concurrent answers to THIS question:
      // another player's answer must not invalidate a legitimate response.
      if (p.phase !== "QUESTION" || time >= p.endsAt || !me?.online || !s.active.has(user.id) || s.answers.has(user.id)) return { ok: false, message: "Resposta indisponível ou já enviada." };
      s.answers.set(user.id, { option: a.option, points: a.option === s.correctIndex ? quizPoints((p.endsAt - time) / this.durations.question) : 0 }); p.revision++; this.early(s);
    }
    this.notify(roomId); return { ok: true };
  }
  leave(roomId: string, userId: string) {
    const s = this.sessions.get(roomId); if (!s) return;
    s.active.delete(userId); s.offline.delete(userId); const p = s.public.players.find((player) => player.id === userId); if (p) p.online = false;
    if (s.public.phase === "LOBBY") s.public.players = s.public.players.filter((player) => player.id !== userId);
    if (s.public.hostId === userId) s.public.hostId = s.public.players.find((player) => s.active.has(player.id) && player.online)?.id ?? "";
    s.public.revision++; this.early(s); this.notify(roomId);
  }
  presence(roomId: string, userId: string, online: boolean) {
    const s = this.sessions.get(roomId); if (!s) return;
    const p = s.public.players.find((player) => player.id === userId); if ((!p || !s.active.has(userId)) && s.public.hostId !== userId) return;
    if (p) p.online = online; if (online) s.offline.delete(userId); else s.offline.set(userId, this.now() + 5000);
    s.public.revision++; this.early(s); this.notify(roomId);
  }
  tick() {
    const now = this.now(); for (const [key, rate] of this.rates) if (rate.until <= now) this.rates.delete(key);
    for (const [roomId, s] of this.sessions) {
      if (now - s.touched > 30 * 60000 && ["LOBBY", "RESULT"].includes(s.public.phase)) { this.delete(roomId); continue; }
      for (const [userId, until] of s.offline) if (until <= now) this.leave(roomId, userId);
      if (!s.public.endsAt || now < s.public.endsAt) continue;
      if (s.public.phase === "QUESTION") this.finish(s); else if (s.public.phase === "REVEAL") this.next(s);
      this.notify(roomId);
    }
  }
  delete(roomId: string) { this.sessions.delete(roomId); for (const key of this.rates.keys()) if (key.startsWith(`${roomId}:`)) this.rates.delete(key); this.notify(roomId); }
}
