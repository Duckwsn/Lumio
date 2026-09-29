import crypto from "node:crypto";
import { gameActionSchema, type GameAction, type DrawPlayer, type DrawSnapshot, type DrawDelta, type GameAck, type User } from "@lumio/shared";
import { allDrawWords, drawWordBanks } from "./drawWords.js";
export const normalizeGuess = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
type Session = Omit<DrawSnapshot, "serverNow" | "maskedWord" | "choices" | "secretWord" | "revealedWord"> & { choices: string[]; word: string; cursor: number; usedWords: Set<string>; active: Set<string>; disconnected: Map<string, number>; touched: number; points: number; canvasMinRevision: number };
export const guessPoints = (remainingFraction: number, previousCorrect: number) => 6 + Math.floor(4 * Math.max(0, Math.min(1, remainingFraction))) - Math.min(2, previousCorrect);
export function matchWinners(players: readonly DrawPlayer[]) { const top = Math.max(0, ...players.map((p) => p.score)); return players.filter((p) => p.score === top).map((p) => p.id); }
export class DrawGameRuntime {
  private sessions = new Map<string, Session>();
  private rates = new Map<string, { count: number; until: number }>();
  constructor(private notify: (room: string, delta?: DrawDelta, forceFull?: boolean) => void, private now = Date.now, private durations = { choose: 15000, draw: 80000, result: 5000 }, private words: readonly string[] = allDrawWords) {}
  boardStamp(room: string) { const s = this.sessions.get(room); return s ? `${s.sessionId}:${s.roundId}:${s.boardRevision}` : ""; }
  snapshot(room: string, viewer: string, includeBoard = true): DrawSnapshot | null {
    const s = this.sessions.get(room); if (!s) return null;
    const { choices, word, cursor, usedWords: _usedWords, active: _active, disconnected: _disconnected, touched: _touched, points: _points, canvasMinRevision: _canvasMinRevision, ...publicState } = s;
    const online = s.players.filter((p) => s.active.has(p.id) && p.online);
    const nextDrawerId = online.length >= 2 && !s.players.some((p) => p.score >= s.targetScore) ? Array.from({ length: s.order.length }, (_, i) => s.order[(cursor + i) % s.order.length]).find((id) => online.some((p) => p.id === id)) : undefined;
    return structuredClone({ ...publicState, nextDrawerId, strokes: includeBoard ? publicState.strokes : [], serverNow: this.now(), maskedWord: s.phase === "DRAWING" ? [...word].map((c) => c === " " || c === "-" ? c : "_").join(" ") : "",
      ...(s.phase === "ROUND_RESULT" || s.phase === "GAME_RESULT" ? { revealedWord: word } : {}),
      ...(viewer === s.drawerId && s.active.has(viewer) ? s.phase === "CHOOSING_WORD" ? { choices } : s.phase === "DRAWING" ? { secretWord: word } : {} : {}),
    });
  }
  private feed(s: Session, text: string) { s.feed.push({ id: ++s.revision, text, createdAt: this.now() }); s.feed = s.feed.slice(-40); }
  private phase(s: Session, phase: Session["phase"], duration = 0) { s.phase = phase; s.startedAt = this.now(); s.endsAt = duration ? s.startedAt + duration : 0; s.revision++; s.touched = this.now(); }
  private next(s: Session) {
    if (s.players.some((p) => p.score >= s.targetScore)) { this.result(s, "target"); return; }
    const online = s.players.filter((p) => s.active.has(p.id) && p.online);
    if (online.length < 2) { this.result(s, "insufficient_players"); return; }
    let next = s.cursor;
    // Bounded scan of one circular order, not an unbounded search through absences.
    for (let skip = 0; skip < s.order.length && !online.some((p) => p.id === s.order[next % s.order.length]); skip++) next++;
    s.round++; s.drawerId = s.order[next % s.order.length]; s.cursor = (next + 1) % s.order.length; s.roundId = crypto.randomUUID();
    s.strokes = []; s.points = 0; s.boardRevision++; s.word = ""; s.roundPoints = {};
    s.players.forEach((p) => { p.guessed = false; });
    const eligible = s.theme === "general" ? this.words : drawWordBanks[s.theme];
    let pool = eligible.filter((word) => !s.usedWords.has(normalizeGuess(word))); s.choices = [];
    if (!pool.length) { s.usedWords.clear(); pool = [...eligible]; }
    while (s.choices.length < 3 && pool.length) s.choices.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
    this.phase(s, "CHOOSING_WORD", this.durations.choose); this.feed(s, "Uma nova rodada começou.");
  }
  private finish(s: Session) { this.phase(s, "ROUND_RESULT", this.durations.result); this.feed(s, "Rodada encerrada."); }
  private result(s: Session, reason: "target" | "insufficient_players") {
    s.resultReason = reason;
    s.winnerIds = reason === "target" ? matchWinners(s.players) : [];
    this.phase(s, "GAME_RESULT");
  }
  action(room: string, user: User, raw: unknown): GameAck {
    const parsed = gameActionSchema.safeParse(raw); if (!parsed.success || parsed.data.roomId !== room) return { ok: false, message: "Ação de jogo inválida." };
    const a = parsed.data; let s = this.sessions.get(room); const time = this.now();
    const key = `${room}:${user.id}:${a.type === "stroke" ? "draw" : a.type === "guess" ? "guess" : "control"}`;
    const rate = this.rates.get(key); const limit = a.type === "stroke" ? 35 : a.type === "guess" ? 4 : 8;
    if (rate && rate.until > time && rate.count >= limit) return { ok: false, message: "Aguarde antes de tentar novamente." };
    this.rates.set(key, rate && rate.until > time ? { ...rate, count: rate.count + 1 } : { count: 1, until: time + 1000 });
    if (a.type === "open") {
      if (!s) {
        if (this.sessions.size >= 1000) return { ok: false, message: "Jogos ocupados. Tente depois." };
        s = { roomId: room, sessionId: crypto.randomUUID(), revision: 1, boardRevision: 0, roundId: "lobby", phase: "LOBBY", hostId: user.id, players: [], order: [], drawerId: null, round: 0, cursor: 0, targetScore: 100, theme: "general", winnerIds: [], startedAt: time, endsAt: 0, strokes: [], feed: [], choices: [], word: "", usedWords: new Set(), active: new Set(), disconnected: new Map(), touched: time, points: 0, canvasMinRevision: 0 };
        this.sessions.set(room, s);
      }
      this.notify(room, undefined, true); return { ok: true };
    }
    if (!s || a.sessionId !== s.sessionId || a.roundId !== s.roundId) return { ok: false, message: "Sessão mudou. Atualize o jogo." };
    if (a.type === "sync") { this.notify(room, undefined, true); return { ok: true }; }
    if (["configure", "start", "rematch", "undo", "clear"].includes(a.type) && a.revision !== s.revision) return { ok: false, message: "Estado mudou. Tente novamente." };
    s.touched = time;
    const p = s.players.find((entry) => entry.id === user.id);
    if (a.type === "configure") {
      if (s.hostId !== user.id || !s.active.has(user.id) || !p?.online || s.phase !== "LOBBY") return { ok: false, message: "Só o coordenador participante configura no lobby." };
      s.targetScore = a.targetScore; s.theme = a.theme; s.revision++;
    } else if (a.type === "join") {
      if (s.phase !== "LOBBY" && s.phase !== "GAME_RESULT") return { ok: false, message: "Observe esta partida; participe na próxima." };
      if (!s.active.has(user.id) && s.players.filter((entry) => s!.active.has(entry.id)).length >= 12) return { ok: false, message: "Limite de 12 jogadores." };
      if (!p) s.players.push({ id: user.id, displayName: user.displayName, avatar: user.avatar, color: user.color, score: 0, online: true, guessed: false });
      else p.online = true;
      s.active.add(user.id); s.disconnected.delete(user.id); s.revision++;
      if (!s.hostId) s.hostId = user.id;
    } else if (a.type === "leave") { this.leave(room, user.id); return { ok: true }; }
    else if (a.type === "start" || a.type === "rematch") {
      if (s.hostId !== user.id || !s.active.has(user.id) || !(s.phase === "LOBBY" && a.type === "start" || s.phase === "GAME_RESULT" && a.type === "rematch")) return { ok: false, message: "Somente o coordenador inicia." };
      const eligible = s.players.filter((entry) => s!.active.has(entry.id) && entry.online);
      if (eligible.length < 2) return { ok: false, message: "Precisamos de pelo menos duas pessoas." };
      s.players = eligible; s.players.forEach((entry) => { entry.score = 0; entry.guessed = false; }); s.order = eligible.map((entry) => entry.id); s.round = 0; s.cursor = 0; s.feed = []; s.usedWords.clear(); s.winnerIds = []; delete s.resultReason;
      if (a.type === "rematch") {
        s.drawerId = null; s.word = ""; s.choices = []; s.strokes = []; s.points = 0; s.roundPoints = {}; s.boardRevision++; s.roundId = crypto.randomUUID(); this.phase(s, "LOBBY");
      } else this.next(s);
    } else {
      if (!p || !p.online || !s.active.has(user.id) || time >= s.endsAt) return { ok: false, message: "Esta ação não está disponível agora." };
      if (a.type === "choose") {
        if (s.phase !== "CHOOSING_WORD" || user.id !== s.drawerId || !s.choices[a.option]) return { ok: false, message: "Escolha indisponível." };
        s.word = s.choices[a.option]; s.usedWords.add(normalizeGuess(s.word)); s.choices = []; this.phase(s, "DRAWING", this.durations.draw);
      } else if (a.type === "guess") {
        if (s.phase !== "DRAWING" || user.id === s.drawerId || p.guessed) return { ok: false, message: "Palpite indisponível." };
        if (normalizeGuess(a.text) === normalizeGuess(s.word)) {
          const gain = guessPoints((s.endsAt - time) / this.durations.draw, s.players.filter((entry) => entry.guessed).length);
          p.guessed = true; p.score += gain;
          s.roundPoints ??= {}; s.roundPoints[p.id] = gain;
          const drawer = s.players.find((entry) => entry.id === s!.drawerId);
          if (drawer) { const reward = Math.min(2, 6 - (s.roundPoints[drawer.id] ?? 0)); drawer.score += reward; s.roundPoints[drawer.id] = (s.roundPoints[drawer.id] ?? 0) + reward; }
          this.feed(s, `${p.displayName} acertou!`);
          if (s.players.filter((entry) => s!.active.has(entry.id) && entry.online && entry.id !== s!.drawerId).every((entry) => entry.guessed)) this.finish(s);
        } else this.feed(s, normalizeGuess(a.text).includes(normalizeGuess(s.word)) ? `${p.displayName} enviou um palpite.` : `${p.displayName}: ${a.text}`);
      } else {
        if (s.phase !== "DRAWING" || user.id !== s.drawerId) return { ok: false, message: "Só o desenhista pode desenhar." };
        if (a.type === "stroke") {
          if (a.revision < s.canvasMinRevision || a.revision > s.revision) return { ok: false, message: "O desenho mudou. Atualize a tela." };
          let stroke = s.strokes.find((entry) => entry.id === a.strokeId);
          if (s.points + a.points.length > 8192 || !stroke && s.strokes.length >= 128) return { ok: false, message: "Limite do desenho. Limpe a tela para continuar." };
          if (!stroke) {
            if (a.offset !== 0) return { ok: false, message: "Traço fora de ordem." };
            stroke = { id: a.strokeId, tool: a.tool, color: a.color, width: a.width, points: [] }; s.strokes.push(stroke);
          }
          if (a.offset !== stroke.points.length || stroke.points.length + a.points.length > 512 || stroke.tool !== a.tool || stroke.color !== a.color || stroke.width !== a.width) return { ok: false, message: "Traço fora de ordem ou limite excedido." };
          stroke.points.push(...a.points); s.points += a.points.length; s.boardRevision++;
          this.notify(room, { sessionId: s.sessionId, roundId: s.roundId, boardRevision: s.boardRevision, stroke: { ...stroke, points: a.points }, offset: a.offset }); return { ok: true };
        } else if (a.type === "undo") { const last = s.strokes.pop(); s.points -= last?.points.length ?? 0; s.boardRevision++; s.revision++; }
        else if (a.type === "clear") { s.strokes = []; s.points = 0; s.boardRevision++; s.revision++; }
        if (a.type === "undo" || a.type === "clear") s.canvasMinRevision = s.revision;
      }
    }
    this.notify(room); return { ok: true };
  }
  leave(room: string, user: string) {
    const s = this.sessions.get(room); if (!s) return;
    s.active.delete(user); s.disconnected.delete(user);
    const p = s.players.find((entry) => entry.id === user); if (p) p.online = false;
    if (s.phase === "LOBBY") s.players = s.players.filter((entry) => entry.id !== user);
    if (s.hostId === user) s.hostId = s.players.find((entry) => s.active.has(entry.id) && entry.online)?.id ?? "";
    if (user === s.drawerId && ["DRAWING", "CHOOSING_WORD"].includes(s.phase)) this.finish(s);
    else if (s.phase === "DRAWING" && s.players.filter((entry) => s.active.has(entry.id) && entry.online && entry.id !== s.drawerId).every((entry) => entry.guessed)) this.finish(s);
    s.revision++; this.notify(room);
  }
  presence(room: string, user: string, online: boolean) {
    const s = this.sessions.get(room); if (!s) return;
    const p = s.players.find((entry) => entry.id === user); if ((!p || !s.active.has(user)) && s.hostId !== user) return;
    if (p) p.online = online; if (online) s.disconnected.delete(user); else s.disconnected.set(user, this.now() + 5000);
    s.revision++; this.notify(room);
  }
  tick() {
    const now = this.now();
    for (const [key, rate] of this.rates) if (rate.until <= now) this.rates.delete(key);
    for (const s of this.sessions.values()) {
      if (now - s.touched > 30 * 60_000 && (s.phase === "LOBBY" || s.phase === "GAME_RESULT")) { this.delete(s.roomId); continue; }
      for (const [user, until] of s.disconnected) if (until <= now) this.leave(s.roomId, user);
      if (!s.endsAt || s.endsAt > now) continue;
      if (s.phase === "CHOOSING_WORD") { s.word = s.choices[0]; s.usedWords.add(normalizeGuess(s.word)); s.choices = []; this.phase(s, "DRAWING", this.durations.draw); }
      else if (s.phase === "DRAWING") this.finish(s);
      else if (s.phase === "ROUND_RESULT") this.next(s);
      this.notify(s.roomId);
    }
  }
  delete(room: string) { this.sessions.delete(room); for (const key of this.rates.keys()) if (key.startsWith(`${room}:`)) this.rates.delete(key); this.notify(room); }
}
