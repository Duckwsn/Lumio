import { useEffect, useRef, useState } from "react";
import { cardColors, cardKinds, cardLabel, type CardAction, type CardSnapshot, type GameCard, type PartyGameSnapshot, type PartyGameState } from "@lumio/shared";
import type { GameConnection } from "../components/GameHub";
import { GameConnectionNotice, GameLobbyStatus } from "./GameFeedback";
import { GameActionBar, GameHud, GameResult, GameShell, GameStage, GameTimer } from "./GameDesignSystem";

function CardFace({ card }: { card: GameCard }) {
  return <><small>{card.color ? `${cardColors[card.color].mark} ${cardColors[card.color].label}` : "◇ Livre"}</small><strong>{card.kind === "number" ? card.value : card.kind === "skip" ? "⊘" : card.kind === "reverse" ? "⇄" : card.kind === "draw_two" ? "+2" : card.kind === "wild_draw" ? "+4" : "◇"}</strong><span>{card.kind === "number" ? "Número" : cardKinds[card.kind]}</span></>;
}
export function CardGame({ socket, roomId, userId }: GameConnection) {
  const [state, setState] = useState<CardSnapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string | null>(null), [declareLast, setDeclareLast] = useState(false), [now, setNow] = useState(Date.now());
  const latest = useRef<CardSnapshot | null>(null), pending = useRef(false), offset = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const [reconnecting, setReconnecting] = useState(!socket.connected);
  const colorPicker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const receive = (s: PartyGameSnapshot | PartyGameState | null) => {
      if (s && (s.gameType !== "cards" || s.roomId !== roomId)) return;
      if (s && latest.current?.sessionId === s.sessionId && s.revision < latest.current.revision) return;
      latest.current = s; setState(s); const receivedAt = Date.now(); offset.current = s ? s.serverNow - receivedAt : 0; setNow(receivedAt); setReconnecting(false);
    };
    const open = () => { if (socket.connected) void socket.timeout(5000).emitWithAck("game:action", { gameType: "cards", type: "open", roomId }).then((ack) => setError(ack.ok ? "" : ack.message ?? "Mesa indisponível.")).catch(() => setError("Servidor não respondeu. Volte aos Jogos para tentar novamente.")); };
    const disconnect = () => { setReconnecting(true); setSelected(null); setDeclareLast(false); setError(""); };
    socket.on("game:snapshot", receive); socket.on("game:state", receive); socket.on("room:snapshot", open); socket.on("disconnect", disconnect); open();
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => { window.clearInterval(timer); socket.off("game:snapshot", receive); socket.off("game:state", receive); socket.off("room:snapshot", open); socket.off("disconnect", disconnect); };
  }, [socket, roomId]);
  useEffect(() => { setSelected(null); setDeclareLast(false); }, [state?.roundId, state?.myHand?.length]);
  useEffect(() => { heading.current?.focus(); }, [state?.phase]);
  useEffect(() => {
    if (state?.myPending?.kind === "wild" && !busy && !reconnecting) colorPicker.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [state?.myPending?.kind, busy, reconnecting]);
  const act = async (action: CardAction) => {
    if (pending.current || reconnecting || !socket.connected) return;
    pending.current = true; setBusy(true);
    try { const ack = await socket.timeout(5000).emitWithAck("game:action", action); setError(ack.ok ? "" : ack.message ?? "Ação recusada."); if (ack.ok) { setSelected(null); if (action.type === "choose_color") heading.current?.focus(); } }
    catch { setError("Servidor não confirmou a ação. Confira a mesa antes de tentar novamente."); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!state) return <p role="status">{error || "Abrindo mesa…"}</p>;
  const me = state.players.find((p) => p.id === userId), host = state.hostId === userId, playing = state.phase === "PLAYING";
  const current = state.players.find((p) => p.id === state.currentPlayerId), ownTurn = playing && state.currentPlayerId === userId;
  const remaining = Math.max(0, Math.ceil((state.turnEndsAt - now - offset.current) / 1000)), enabled = ownTurn && me?.online && socket.connected && !reconnecting && remaining > 0 && !busy;
  const base = { gameType: "cards" as const, roomId, sessionId: state.sessionId, roundId: state.roundId, revision: state.revision };
  const picked = state.myHand?.find((c) => c.id === selected), legal = state.legalCardIds ?? [];
  return <GameShell game="cards" className="card-game" data-phase={state.phase} aria-label="Lumio Cartas">
    <GameHud className={`card-heading ${ownTurn ? "is-own-turn" : ""}`}><div><h2 ref={heading} tabIndex={-1}>Lumio Cartas</h2><p role="status">{playing ? ownTurn ? "Sua vez" : `Vez de ${current?.displayName ?? "…"}` : state.phase === "LOBBY" ? `${state.players.filter((p) => p.participating && p.online).length}/8 jogadores` : "Partida encerrada"}</p></div>{playing ? <GameTimer seconds={remaining} label="Tempo do turno" /> : null}</GameHud>
    {error ? <p role="alert" className="draw-error">{error}</p> : null}
    <GameConnectionNotice reconnecting={reconnecting} />
    <ul className="game-participants card-players" aria-label="Jogadores e cartas">{state.players.map((p) => <li key={p.id} className={state.currentPlayerId === p.id ? "is-current" : ""}><span className="quiz-avatar" style={{ background: p.color }}>{p.displayName.slice(0, 1)}</span><span><strong>{p.id === userId ? "Você" : p.displayName}</strong><small>{playing || state.phase === "RESULT" ? `${p.cardCount} cartas` : p.id === state.hostId ? "Coordena" : "Participante"}{!p.online ? " · offline" : ""}{!p.participating ? " · saiu" : ""}{p.declaredLast ? " · Última!" : ""}</small></span></li>)}</ul>
    {playing ? <>
      <GameStage className="card-table"><div className={`lumio-card card-discard ${state.topCard?.color ?? "wild"}`} aria-label={state.topCard ? `Descarte: ${cardLabel(state.topCard)}` : "Descarte"}>{state.topCard ? <CardFace card={state.topCard} /> : null}</div><div className="card-table-status"><strong>Cor ativa: {cardColors[state.activeColor].mark} {cardColors[state.activeColor].label}</strong><span>{state.direction === 1 ? "→" : "←"} {state.direction === 1 ? "Sentido de entrada" : "Sentido inverso"}</span><small>{state.drawCount} na compra · sem stacking</small><button disabled={!enabled || state.substate !== "AWAITING_PLAY"} onClick={() => { void act({ ...base, type: "draw" }); }}>Comprar 1</button></div></GameStage>
      {state.myPending?.kind === "wild" ? <div ref={colorPicker} className="card-color-picker" role="group" aria-label="Escolher cor"><strong>Escolha a nova cor</strong>{Object.entries(cardColors).map(([color, data]) => <button key={color} className={color} disabled={!enabled} onClick={() => { void act({ ...base, type: "choose_color", color: color as keyof typeof cardColors }); }}>{data.mark} {data.label}</button>)}</div> : null}
      {state.myHand ? <div className="card-hand-area"><div className="card-hand-title"><strong>Sua mão · {state.myHand.length}</strong><small>{reconnecting ? "Aguarde a reconexão" : enabled ? state.myPending?.kind === "wild" ? "Escolha a cor para confirmar" : picked ? `Selecionada: ${cardLabel(picked)}` : legal.length ? "Selecione e confirme a jogada" : "Sem carta jogável · compre 1" : "Aguarde sua vez"}</small></div>{state.myHand.length > 4 ? <small className="card-hand-hint">Deslize para ver todas as cartas.</small> : null}<div className="card-hand" role="group" aria-label="Sua mão">{state.myHand.map((card) => <button key={card.id} className={`lumio-card ${card.color ?? "wild"} ${legal.includes(card.id) ? "is-legal" : ""}`} aria-label={cardLabel(card)} aria-pressed={selected === card.id} disabled={!enabled || !legal.includes(card.id)} onClick={() => setSelected(card.id)}><CardFace card={card} /></button>)}</div><div className="card-hand-actions">{state.myHand.length === 2 && ownTurn ? <label><input type="checkbox" checked={declareLast} disabled={!enabled || state.myPending?.kind === "wild"} onChange={(e) => setDeclareLast(e.target.checked)} /> Última! <small>(sem declarar: compra 2)</small></label> : null}<button className="primary-button" disabled={!enabled || !picked || !legal.includes(picked.id)} onClick={() => { if (picked) void act({ ...base, type: state.myPending?.kind === "drawn" ? "play_drawn" : "play", cardId: picked.id, declareLast }); }}>Jogar selecionada</button>{state.myPending?.kind === "drawn" ? <button disabled={!enabled} onClick={() => { void act({ ...base, type: "pass_drawn" }); }}>Manter e passar</button> : null}</div></div> : <p>Observando a mesa. Participe na próxima partida.</p>}
      <ol className="card-feed" aria-label="Acontecimentos da mesa">{state.feed.slice(-3).map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>
    </> : <>
      {state.phase === "RESULT" ? <GameResult><h3 className="quiz-finale">{state.winnerId ? `${state.players.find((p) => p.id === state.winnerId)?.displayName} ficou sem cartas e venceu!` : "Faltam jogadores para continuar."}</h3></GameResult> : null}
      {state.phase === "LOBBY" ? <><GameLobbyStatus host={host} hostName={state.players.find((p) => p.id === state.hostId)?.displayName} count={state.players.filter((p) => p.participating && p.online).length} /><details className="card-rules"><summary>Como jogar</summary><p>Combine a cor, número ou ação. Cartas livres mudam a cor. Comprar 2 e Mudar +4 fazem o próximo comprar e perder a vez. Virar com dois devolve sua vez. Ao ficar com uma, marque Última! junto da jogada. Cada turno tem 35s; o relógio continua com painéis abertos.</p></details></> : null}
    </>}
    <GameActionBar className="card-lobby-actions">{me?.participating || !playing ? <button disabled={busy || reconnecting || !socket.connected} onClick={() => { void act({ ...base, type: me?.participating ? "leave" : "join" }); }}>{me?.participating ? "Sair do jogo" : "Participar"}</button> : null}{host && !playing ? <button className="primary-button" disabled={busy || reconnecting || !me?.participating || !me.online || state.players.filter((p) => p.participating && p.online).length < 2} onClick={() => { void act({ ...base, type: state.phase === "LOBBY" ? "start" : "rematch" }); }}>{state.phase === "LOBBY" ? "Iniciar partida" : "Jogar novamente"}</button> : null}</GameActionBar>
  </GameShell>;
}
