import crypto from "node:crypto";
import { cardActionSchema, cardColors, isCardLegal, type CardColor, type CardSnapshot, type GameCard, type GameAck, type User } from "@lumio/shared";
import { freshCardDeck, shuffleCards } from "./cardDeck.js";

type Pending = { kind: "wild" | "drawn"; cardId: string; declareLast: boolean };
type Session = { state: Omit<CardSnapshot, "myHand" | "legalCardIds" | "myPending">; deck: GameCard[]; discard: GameCard[]; hands: Map<string, GameCard[]>; active: Set<string>; offline: Map<string, number>; pending?: Pending; touched: number };
export class CardGameRuntime {
  private sessions = new Map<string, Session>();
  private rates = new Map<string, { count: number; until: number }>();
  constructor(private notify: (roomId: string) => void, private now = Date.now, private makeDeck = freshCardDeck, private turnDuration = 35000) {}
  snapshot(roomId: string, viewer: string): CardSnapshot | null {
    const s = this.sessions.get(roomId); if (!s) return null;
    // Only the public state is spread. Hands/deck/pending stay in separate zones.
    const out: CardSnapshot = { ...s.state, serverNow: this.now(), drawCount: s.deck.length, topCard: s.discard.at(-1), players: s.state.players.map((p) => ({ ...p, participating: s.active.has(p.id), cardCount: s.hands.get(p.id)?.length ?? 0 })) };
    const hand = s.active.has(viewer) ? s.hands.get(viewer) : undefined;
    if (hand) {
      out.myHand = hand;
      out.legalCardIds = s.state.phase === "PLAYING" && s.state.currentPlayerId === viewer && s.state.players.find((p) => p.id === viewer)?.online && this.now() < s.state.turnEndsAt && s.state.substate !== "AWAITING_WILD_COLOR" ? hand.filter((c) => (!s.pending || c.id === s.pending.cardId) && isCardLegal(c, s.discard.at(-1)!, s.state.activeColor)).map((c) => c.id) : [];
      if (s.pending && s.state.currentPlayerId === viewer) out.myPending = { kind: s.pending.kind, cardId: s.pending.cardId };
    }
    return structuredClone(out);
  }
  private changed(roomId: string, s: Session) { s.state.revision++; s.touched = this.now(); this.notify(roomId); }
  private feed(s: Session, text: string) { s.state.feed.push({ id: crypto.randomUUID(), text }); s.state.feed = s.state.feed.slice(-12); }
  private online(s: Session) { return s.state.players.filter((p) => s.active.has(p.id) && p.online); }
  private take(s: Session, id: string, count: number) {
    const hand = s.hands.get(id)!; let taken = 0;
    for (let i = 0; i < count; i++) {
      if (!s.deck.length && s.discard.length > 1) { const top = s.discard.pop()!; s.deck = shuffleCards(s.discard); s.discard = [top]; }
      const card = s.deck.pop(); if (!card) break; hand.push(card); taken++;
    }
    if (hand.length !== 1) { const p = s.state.players.find((p) => p.id === id); if (p) p.declaredLast = false; }
    return taken;
  }
  private nextId(s: Session, from: string) {
    const order = s.state.turnOrder, start = order.indexOf(from);
    for (let step = 1; step <= order.length; step++) { const id = order[(start + step * s.state.direction + order.length * 2) % order.length]; if (this.online(s).some((p) => p.id === id)) return id; }
    return "";
  }
  private finish(s: Session, winnerId?: string) { s.state.phase = "RESULT"; s.state.winnerId = winnerId; s.state.resultReason = winnerId ? "empty_hand" : "insufficient_players"; s.state.currentPlayerId = ""; s.state.turnEndsAt = 0; s.state.substate = "AWAITING_PLAY"; delete s.pending; }
  private beginTurn(s: Session, id: string) {
    delete s.pending; s.state.substate = "AWAITING_PLAY";
    if (!id || this.online(s).length < 2) { this.finish(s); return; }
    s.state.currentPlayerId = id; s.state.roundId = crypto.randomUUID(); s.state.turnStartedAt = this.now(); s.state.turnEndsAt = this.now() + this.turnDuration;
  }
  private timeout(s: Session) {
    const id = s.state.currentPlayerId, p = s.state.players.find((p) => p.id === id);
    // A voluntarily drawn card was already bought; no second purchase on timeout.
    const bought = s.pending?.kind === "drawn" ? 0 : this.take(s, id, 1);
    this.feed(s, `${p?.displayName ?? "Jogador"}: tempo esgotado${bought ? `, comprou ${bought}` : ""}. Turno passou.`);
    this.beginTurn(s, this.nextId(s, id));
  }
  private commit(s: Session, card: GameCard, declareLast: boolean, color: CardColor) {
    const id = s.state.currentPlayerId, hand = s.hands.get(id)!;
    hand.splice(hand.findIndex((c) => c.id === card.id), 1); s.discard.push(card); s.state.activeColor = color; delete s.pending;
    const me = s.state.players.find((p) => p.id === id)!;
    this.feed(s, `${me.displayName} jogou uma carta${card.color === null ? ` e escolheu ${cardColors[color].label}` : ""}.`);
    if (hand.length === 1) {
      me.declaredLast = declareLast;
      if (declareLast) this.feed(s, `${me.displayName}: Última!`);
      else { const n = this.take(s, id, 2); this.feed(s, `${me.displayName} não declarou Última! Comprou ${n}.`); }
    } else me.declaredLast = false;
    let next = this.nextId(s, id);
    if (card.kind === "reverse") { s.state.direction = s.state.direction === 1 ? -1 : 1; this.feed(s, "Direção invertida."); next = this.online(s).length === 2 ? id : this.nextId(s, id); }
    if (card.kind === "skip" || card.kind === "draw_two" || card.kind === "wild_draw") {
      const target = s.state.players.find((p) => p.id === next);
      if (card.kind !== "skip") { const n = this.take(s, next, card.kind === "draw_two" ? 2 : 4); this.feed(s, `${target?.displayName} comprou ${n} e perdeu a vez.`); }
      else this.feed(s, `${target?.displayName} perdeu a vez.`);
      next = this.nextId(s, next);
    }
    // Final action effects resolve before declaring the unique empty-hand winner.
    if (!hand.length) this.finish(s, id); else this.beginTurn(s, next);
  }
  action(roomId: string, user: User, raw: unknown): GameAck {
    const parsed = cardActionSchema.safeParse(raw); if (!parsed.success || parsed.data.roomId !== roomId) return { ok: false, message: "Ação de cartas inválida." };
    const a = parsed.data, key = `${roomId}:${user.id}`, now = this.now(), rate = this.rates.get(key);
    if (rate && rate.until > now && rate.count >= 8) return { ok: false, message: "Aguarde antes de tentar novamente." };
    this.rates.set(key, rate && rate.until > now ? { ...rate, count: rate.count + 1 } : { count: 1, until: now + 1000 });
    let s = this.sessions.get(roomId);
    if (a.type === "open") {
      if (!s) {
        if (this.sessions.size >= 1000) return { ok: false, message: "Jogos ocupados." };
        s = { state: { gameType: "cards", roomId, sessionId: crypto.randomUUID(), roundId: "lobby", revision: 1, hostId: user.id, phase: "LOBBY", players: [], turnOrder: [], currentPlayerId: "", direction: 1, activeColor: "mint", drawCount: 0, substate: "AWAITING_PLAY", turnStartedAt: 0, turnEndsAt: 0, serverNow: now, feed: [] }, deck: [], discard: [], hands: new Map(), active: new Set(), offline: new Map(), touched: now };
        this.sessions.set(roomId, s);
      }
      this.notify(roomId); return { ok: true };
    }
    if (!s || a.sessionId !== s.state.sessionId || a.roundId !== s.state.roundId || a.revision !== s.state.revision) return { ok: false, message: "Estado mudou. Atualize a mesa." };
    const p = s.state, me = p.players.find((p) => p.id === user.id);
    if (a.type === "sync") { this.notify(roomId); return { ok: true }; }
    if (a.type === "join") {
      if (p.phase !== "LOBBY" && p.phase !== "RESULT") return { ok: false, message: "Observe esta partida; participe na próxima." };
      if (!s.active.has(user.id) && s.active.size >= 8) return { ok: false, message: "Limite de 8 jogadores." };
      if (!me) p.players.push({ id: user.id, displayName: user.displayName, color: user.color, avatar: user.avatar, online: true, participating: true, cardCount: 0, declaredLast: false }); else { me.online = true; me.declaredLast = false; }
      s.active.add(user.id); s.offline.delete(user.id); if (!p.hostId) p.hostId = user.id;
    } else if (a.type === "leave") { if (!s.active.has(user.id)) return { ok: false }; this.leave(roomId, user.id); return { ok: true }; }
    else if (a.type === "start" || a.type === "rematch") {
      if (p.hostId !== user.id || !me?.online || !s.active.has(user.id) || !(a.type === "start" && p.phase === "LOBBY" || a.type === "rematch" && p.phase === "RESULT") || this.online(s).length < 2) return { ok: false, message: "Só o coordenador participante inicia, com pelo menos duas pessoas." };
      p.players = this.online(s); s.active = new Set(p.players.map((p) => p.id)); s.offline.clear(); s.deck = []; s.discard = []; s.hands.clear(); delete s.pending;
      p.players.forEach((p) => { p.cardCount = 0; p.declaredLast = false; }); p.turnOrder = p.players.map((p) => p.id); p.direction = 1; p.feed = []; delete p.winnerId; delete p.resultReason;
      if (a.type === "rematch") { p.phase = "LOBBY"; p.roundId = crypto.randomUUID(); p.currentPlayerId = ""; p.turnEndsAt = 0; }
      else {
        s.deck = this.makeDeck();
        for (let deal = 0; deal < 7; deal++) for (const player of p.players) { if (!s.hands.has(player.id)) s.hands.set(player.id, []); this.take(s, player.id, 1); }
        const top = s.deck.findIndex((c) => c.kind === "number"); s.discard.push(...s.deck.splice(top, 1)); p.activeColor = s.discard[0].color!; p.phase = "PLAYING"; this.beginTurn(s, p.turnOrder[0]);
      }
    } else {
      if (p.phase !== "PLAYING" || p.currentPlayerId !== user.id || !s.active.has(user.id) || !me?.online || now >= p.turnEndsAt) return { ok: false, message: "Aguarde sua vez ou a atualização da mesa." };
      const hand = s.hands.get(user.id)!;
      if (a.type === "choose_color") {
        if (s.pending?.kind !== "wild") return { ok: false, message: "Nenhuma cor pendente." };
        const card = hand.find((c) => c.id === s!.pending!.cardId)!; this.commit(s, card, s.pending.declareLast, a.color);
      } else if (a.type === "pass_drawn") {
        if (s.pending?.kind !== "drawn") return { ok: false }; this.beginTurn(s, this.nextId(s, user.id));
      } else if (a.type === "draw") {
        if (s.pending) return { ok: false, message: "Conclua a decisão pendente." };
        const n = this.take(s, user.id, 1); this.feed(s, `${me.displayName} comprou ${n} carta.`);
        const card = n ? hand.at(-1)! : null;
        if (card && isCardLegal(card, s.discard.at(-1)!, p.activeColor)) { s.pending = { kind: "drawn", cardId: card.id, declareLast: false }; p.substate = "AWAITING_DRAWN_CARD_DECISION"; }
        else this.beginTurn(s, this.nextId(s, user.id));
      } else if (a.type === "play" || a.type === "play_drawn") {
        const card = hand.find((c) => c.id === a.cardId);
        if (!card || !isCardLegal(card, s.discard.at(-1)!, p.activeColor) || (a.type === "play" ? Boolean(s.pending) : s.pending?.kind !== "drawn" || s.pending.cardId !== card.id)) return { ok: false, message: "Carta indisponível nesta jogada." };
        if (card.color === null) { s.pending = { kind: "wild", cardId: card.id, declareLast: a.declareLast }; p.substate = "AWAITING_WILD_COLOR"; }
        else this.commit(s, card, a.declareLast, card.color);
      }
    }
    this.changed(roomId, s); return { ok: true };
  }
  leave(roomId: string, userId: string) {
    const s = this.sessions.get(roomId); if (!s) return;
    if (!s.active.has(userId)) {
      if (s.state.hostId === userId) { s.offline.delete(userId); s.state.hostId = this.online(s)[0]?.id ?? ""; this.changed(roomId, s); }
      return;
    }
    const p = s.state, current = p.currentPlayerId === userId;
    s.deck = shuffleCards([...s.deck, ...(s.hands.get(userId) ?? [])]); s.hands.delete(userId); s.active.delete(userId); s.offline.delete(userId);
    const me = p.players.find((p) => p.id === userId)!; me.online = false; me.declaredLast = false;
    if (p.phase === "LOBBY") p.players = p.players.filter((p) => p.id !== userId);
    if (p.hostId === userId) p.hostId = this.online(s)[0]?.id ?? "";
    if (p.phase === "PLAYING") { if (this.online(s).length < 2) this.finish(s); else if (current) this.beginTurn(s, this.nextId(s, userId)); }
    this.changed(roomId, s);
  }
  presence(roomId: string, userId: string, online: boolean) {
    const s = this.sessions.get(roomId), me = s?.state.players.find((p) => p.id === userId); if (!s || ((!me || !s.active.has(userId)) && s.state.hostId !== userId)) return;
    if (me?.online === online) return; if (me) me.online = online;
    if (online) { s.offline.delete(userId); if (!s.state.hostId) s.state.hostId = userId; } else s.offline.set(userId, this.now() + 5000);
    this.changed(roomId, s);
  }
  tick() {
    const now = this.now(); for (const [key, rate] of this.rates) if (rate.until <= now) this.rates.delete(key);
    for (const [roomId, s] of this.sessions) {
      if (now - s.touched > 30 * 60000 && s.state.phase !== "PLAYING") { this.delete(roomId); continue; }
      let expiredCurrent = false, changed = false;
      for (const [id, until] of s.offline) if (now >= until) { s.offline.delete(id); changed = true; if (s.state.hostId === id) s.state.hostId = this.online(s)[0]?.id ?? ""; if (s.state.currentPlayerId === id) expiredCurrent = true; }
      if (s.state.phase === "PLAYING" && (expiredCurrent || now >= s.state.turnEndsAt)) { this.timeout(s); changed = true; }
      else if (s.state.phase === "PLAYING" && changed && this.online(s).length < 2) this.finish(s);
      if (changed) this.changed(roomId, s);
    }
  }
  delete(roomId: string) { this.sessions.delete(roomId); for (const key of this.rates.keys()) if (key.startsWith(`${roomId}:`)) this.rates.delete(key); this.notify(roomId); }
}
