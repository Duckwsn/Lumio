import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import type { DrawSnapshot, DrawState, GameAction, GameAck, ServerToClientEvents, ClientToServerEvents } from "@lumio/shared";
import { DrawCanvas } from "./DrawCanvas";
import { DrawScoreboard } from "./DrawScoreboard";
import { usePartyGameChat } from "./PartyGameChat";

export function DrawGame({ socket, roomId, userId, children, onGames, onMedia }: { socket: Socket<ServerToClientEvents, ClientToServerEvents>; roomId: string; userId: string; children?: ReactNode; onGames?: () => void; onMedia?: () => void }) {
  const [state, setState] = useState<DrawSnapshot | null>(null), [error, setError] = useState(""), [time, setTime] = useState(Date.now());
  const latest = useRef<DrawSnapshot | null>(null), clockOffset = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null), choiceDialog = useRef<HTMLDivElement>(null);
  const select = usePartyGameChat()?.select;
  useEffect(() => { select?.(true); return () => select?.(false); }, [select]);
  useEffect(() => { heading.current?.focus(); }, [state?.sessionId]);
  useEffect(() => {
    if (state?.phase === "CHOOSING_WORD" && state.drawerId === userId) choiceDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else if (state?.drawerId === userId && state.phase === "DRAWING") document.querySelector<HTMLCanvasElement>(".draw-board canvas")?.focus();
  }, [state?.phase, state?.roundId, userId]);
  useEffect(() => {
    const open = () => { if (socket.connected && !latest.current) void socket.timeout(5000).emitWithAck("game:action", { type: "open", roomId }).then((ack) => { if (!ack.ok) setError(ack.message ?? "Jogo indisponível."); else setError(""); }).catch(() => setError("Servidor não respondeu. Volte aos Jogos para tentar novamente.")); };
    const receive = (snapshot: DrawSnapshot | null) => {
      if (snapshot && snapshot.roomId !== roomId) return;
      const old = latest.current;
      if (snapshot && old && snapshot.sessionId === old.sessionId && (snapshot.revision < old.revision || snapshot.revision === old.revision && snapshot.boardRevision < old.boardRevision)) return;
      latest.current = snapshot; clockOffset.current = snapshot ? snapshot.serverNow - Date.now() : 0; setState(snapshot);
      if (!snapshot && old) setError("A sessão terminou. Volte aos Jogos para abrir uma nova partida.");
    };
    const disconnected = () => { latest.current = null; setState(null); setError("Reconectando à Party…"); };
    const receiveState = (metadata: DrawState) => { const old = latest.current; if (old && old.sessionId === metadata.sessionId && old.roundId === metadata.roundId) receive({ ...metadata, strokes: old.strokes }); else open(); };
    socket.on("game:snapshot", receive); socket.on("game:state", receiveState); socket.on("room:snapshot", open); socket.on("disconnect", disconnected); open();
    const timer = window.setInterval(() => setTime(Date.now()), 250);
    return () => { window.clearInterval(timer); socket.off("game:snapshot", receive); socket.off("game:state", receiveState); socket.off("room:snapshot", open); socket.off("disconnect", disconnected); };
  }, [socket, roomId]);
  const act = (action: GameAction, callback?: (ack: GameAck) => void) => {
    if (!socket.connected) { setError("Aguarde a conexão com a Party."); callback?.({ ok: false }); return; }
    void socket.timeout(5000).emitWithAck("game:action", action).then((ack) => { if (!ack.ok) setError(ack.message ?? "Não foi possível executar a ação."); else setError(""); callback?.(ack); }).catch(() => { setError("Servidor não respondeu. Tente novamente."); callback?.({ ok: false }); });
  };
  if (!state) return <div className="draw-loading" role="status">{error || "Abrindo Desenhe e Adivinhe…"}</div>;
  const me = state.players.find((p) => p.id === userId), host = state.hostId === userId, drawer = state.drawerId === userId;
  const remaining = Math.max(0, Math.ceil((state.endsAt - time - clockOffset.current) / 1000));
  const base = { roomId, sessionId: state.sessionId, roundId: state.roundId, revision: state.revision };
  const playing = state.phase !== "LOBBY" && state.phase !== "GAME_RESULT", choosing = drawer && state.phase === "CHOOSING_WORD";
  const drawerName = state.players.find((p) => p.id === state.drawerId)?.displayName ?? "Desenhista";
  const nextDrawer = Array.from({ length: Math.max(0, state.totalRounds - state.round) }, (_, offset) => state.order[(state.round + offset) % state.order.length]).find((id) => state.players.some((p) => p.id === id && p.online));
  const topScore = Math.max(0, ...state.players.map((p) => p.score));
  const winners = state.players.filter((p) => p.score === topScore).map((p) => p.displayName).join(" e ");
  return <section className={`draw-game ${drawer ? "is-drawer" : "is-guesser"}`} aria-label="Desenhe e Adivinhe">
    <header className="draw-heading"><div><h2 ref={heading} tabIndex={-1}>Desenhe e Adivinhe</h2><p role="status">{state.phase === "LOBBY" ? `${state.players.filter((p) => p.online).length}/12 jogadores · duas voltas` : state.phase === "GAME_RESULT" ? "Partida concluída" : `Rodada ${state.round}/${state.totalRounds} · ${drawerName} ${state.phase === "CHOOSING_WORD" ? "escolhe" : "desenha"}`}</p></div>{playing ? <div className="draw-clock"><time className={remaining <= 10 ? "is-ending" : ""} aria-label="Tempo restante">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</time>{me ? <small>{me.score} pts · #{1 + state.players.filter((p) => p.score > me.score).length}</small> : null}</div> : null}</header>
    {error ? <p className="draw-error" role="alert">{error}</p> : null}
    <div className="draw-content" {...(choosing ? { inert: "" } : {})}>
    {!playing ? <div className="draw-lobby">
      {state.phase === "GAME_RESULT" ? <div className="draw-finale"><span>Fim de partida</span><h3>{topScore ? `${winners} · vitória!` : "Até a próxima rodada!"}</h3><p>{topScore} pontos</p></div> : null}
      <DrawScoreboard state={state} userId={userId} />
      <p>{host ? "Você coordena." : `Coordena: ${state.players.find((p) => p.id === state.hostId)?.displayName ?? "criador da sessão"}.`} {state.players.filter((p) => p.online).length < 2 ? "Mínimo de 2 jogadores." : ""}</p>
      <div className="draw-lobby-actions">{!me?.online ? <button onClick={() => act({ ...base, type: "join" })}>Participar</button> : <button onClick={() => act({ ...base, type: "leave" })}>Sair do jogo</button>}
      {host ? <button className="primary-button" disabled={!me?.online || state.players.filter((p) => p.online).length < 2} onClick={() => act({ ...base, type: state.phase === "GAME_RESULT" ? "rematch" : "start" })}>{state.phase === "GAME_RESULT" ? "Jogar novamente" : "Iniciar partida"}</button> : <span>Aguardando o coordenador.</span>}
      {state.phase === "GAME_RESULT" ? <><button onClick={onGames}>Voltar aos jogos</button><button onClick={onMedia}>Voltar à mídia</button></> : null}</div>
    </div> : <>
      <div className="draw-word" aria-live="polite">{state.phase === "ROUND_RESULT" ? <strong>Era: {state.revealedWord || "Rodada pulada"}</strong> : state.phase === "CHOOSING_WORD" ? <span>{drawerName} está escolhendo…</span> : <strong>{state.secretWord ?? state.maskedWord}</strong>}</div>
      <DrawCanvas snapshot={state} socket={socket} enabled={drawer && state.phase === "DRAWING" && socket.connected && remaining > 0} act={act} />
      <div className="draw-bottom">
        {state.phase === "ROUND_RESULT" ? <div className="draw-round-result" role="status"><strong>Rodada encerrada</strong><ul>{state.players.filter((p) => p.guessed).map((p) => <li key={p.id}>{p.displayName} acertou · +{state.roundPoints?.[p.id] ?? 0}</li>)}</ul><p>{nextDrawer ? `A seguir: ${state.players.find((p) => p.id === nextDrawer)?.displayName}` : "A seguir: resultado final"}</p></div> : <p className="draw-context">{drawer ? "Desenhe sem escrever a palavra." : me?.guessed ? "Você acertou!" : me?.online ? "Palpite pelo chat da Party." : "Observando · você entra na próxima partida."}</p>}
        <DrawScoreboard state={state} userId={userId} />
        {children ? <div className="game-fullscreen-composer" aria-label="Chat da Party em tela cheia">{children}</div> : null}
        <details className="draw-order"><summary>Ordem de desenho · duas voltas</summary><ol>{state.order.map((id) => <li key={id}>{state.players.find((p) => p.id === id)?.displayName ?? "Ausente"}</li>)}</ol></details>
        {me?.online ? <button className="draw-leave" onClick={() => act({ ...base, type: "leave" })}>Sair do jogo</button> : null}
      </div>
    </>}
    </div>
    {choosing ? <div className="draw-choice-layer"><div ref={choiceDialog} className="draw-choice-dialog" role="dialog" aria-label="Escolha o que você vai desenhar" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== "Tab") return;
      const buttons = [...(choiceDialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }}><div><h3>Escolha o que você vai desenhar</h3><time aria-label="Tempo para escolher">{remaining}s</time></div><div className="draw-choices">{state.choices?.map((word, option) => <button key={word} disabled={remaining <= 0} onClick={() => act({ ...base, type: "choose", option })}>{word}</button>)}</div></div></div> : null}
  </section>;
}
