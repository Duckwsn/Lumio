import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { DrawSnapshot, DrawState, GameAction, GameAck, ServerToClientEvents, ClientToServerEvents } from "@lumio/shared";
import { DrawCanvas } from "./DrawCanvas";

export function DrawGame({ socket, roomId, userId }: { socket: Socket<ServerToClientEvents, ClientToServerEvents>; roomId: string; userId: string }) {
  const [state, setState] = useState<DrawSnapshot | null>(null), [error, setError] = useState(""), [guess, setGuess] = useState(""), [time, setTime] = useState(Date.now());
  const latest = useRef<DrawSnapshot | null>(null), clockOffset = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [state?.sessionId]);
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
  const playing = state.phase !== "LOBBY" && state.phase !== "GAME_RESULT";
  return <section className="draw-game" aria-label="Desenhe e Adivinhe">
    <header className="draw-heading"><div><h2 ref={heading} tabIndex={-1}>Desenhe e Adivinhe</h2><p role="status" aria-live="polite">{state.phase === "LOBBY" ? "Duas pessoas ou mais. Duas voltas para cada uma desenhar." : state.phase === "GAME_RESULT" ? "Partida concluída" : `Rodada ${state.round}/${state.totalRounds} · ${state.players.find((p) => p.id === state.drawerId)?.displayName ?? ""} desenha`}</p></div>{playing ? <time aria-label="Tempo restante">{remaining}s</time> : null}</header>
    {error ? <p className="draw-error" role="alert">{error}</p> : null}
    {playing && me?.online ? <button className="draw-leave" onClick={() => act({ ...base, type: "leave" })}>Sair do jogo</button> : null}
    {state.phase === "LOBBY" || state.phase === "GAME_RESULT" ? <div className="draw-lobby">
      <ol aria-label="Placar do jogo">{[...state.players].sort((a, b) => b.score - a.score).map((p) => <li key={p.id}><span className="avatar" style={{ background: p.color }}>{p.displayName.slice(0, 1)}</span><span>{p.displayName}{p.id === state.hostId ? " · coordena" : ""}{!p.online ? " · ausente" : ""}</span><strong>{p.score} pts</strong></li>)}</ol>
      <p>Participação é opcional. O chat e a voz da Party continuam independentes.</p>
      <p>{host ? "Você coordena a partida." : `Coordenação: ${state.players.find((p) => p.id === state.hostId)?.displayName ?? "criador da sessão (observando)"}.`}</p>
      <div className="draw-lobby-actions">{!me?.online ? <button onClick={() => act({ ...base, type: "join" })}>Participar</button> : <button onClick={() => act({ ...base, type: "leave" })}>Sair do jogo</button>}
      {host ? <button className="primary-button" disabled={!me || state.players.filter((p) => p.online).length < 2} onClick={() => act({ ...base, type: state.phase === "GAME_RESULT" ? "rematch" : "start" })}>{state.phase === "GAME_RESULT" ? "Jogar novamente" : "Iniciar partida"}</button> : <span>O coordenador inicia quando todos entrarem.</span>}</div>
    </div> : <>
      <div className="draw-word" aria-live="polite">{state.phase === "ROUND_RESULT" ? <strong>Era: {state.revealedWord || "Rodada pulada"}</strong> : state.phase === "CHOOSING_WORD" ? drawer ? <div className="draw-choices">{state.choices?.map((word, option) => <button key={word} onClick={() => act({ ...base, type: "choose", option })}>{word}</button>)}</div> : <span>O desenhista está escolhendo a palavra…</span> : <strong>{state.secretWord ?? state.maskedWord}</strong>}</div>
      <DrawCanvas snapshot={state} socket={socket} enabled={drawer && state.phase === "DRAWING" && socket.connected && remaining > 0} act={act} />
      <div className="draw-bottom"><ol className="draw-feed" aria-label="Palpites do jogo" aria-live="polite">{state.feed.slice(-5).map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>
      {!drawer && me && me.online && !me.guessed && state.phase === "DRAWING" ? <form onSubmit={(event) => { event.preventDefault(); if (guess.trim()) { act({ ...base, type: "guess", text: guess }); setGuess(""); } }}><label className="sr-only" htmlFor="draw-guess">Seu palpite</label><input id="draw-guess" maxLength={80} autoComplete="off" placeholder="Seu palpite…" value={guess} onChange={(e) => setGuess(e.target.value)} /><button type="submit" disabled={!guess.trim() || !socket.connected}>Enviar palpite</button></form> : <span>{drawer ? "Desenhe sem escrever a palavra." : me?.guessed ? "Você acertou!" : "Observando · participe na próxima partida."}</span>}
      <div className="draw-scores" aria-label="Pontos">{state.players.map((p) => <span key={p.id}>{p.displayName}: {p.score}{p.guessed ? " ✓" : ""}</span>)}</div>
      <details className="draw-order"><summary>Ordem de desenho · duas voltas</summary><ol>{state.order.map((id) => <li key={id}>{state.players.find((p) => p.id === id)?.displayName ?? "Ausente"}</li>)}</ol></details></div>
    </>}
  </section>;
}
