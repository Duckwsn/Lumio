import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import type { ChatMessage, DrawSnapshot, PartyGameSnapshot, PartyGameState, GameAction, GameAck, ServerToClientEvents, ClientToServerEvents } from "@lumio/shared";
import { DrawCanvas } from "./DrawCanvas";
import { DrawScoreboard } from "./DrawScoreboard";
import { usePartyGameChat } from "./PartyGameChat";
import { drawTargets, drawThemes } from "@lumio/shared";
import { GameConnectionNotice, GameLobbyStatus } from "./GameFeedback";
import { GameActionBar, GameHud, GameLobby, GameResult, GameShell, GameTimer } from "./GameDesignSystem";

export function DrawGame({ socket, roomId, userId, children, messages = [], onGames }: { socket: Socket<ServerToClientEvents, ClientToServerEvents>; roomId: string; userId: string; children?: ReactNode; messages?: ChatMessage[]; onGames?: () => void }) {
  const [state, setState] = useState<DrawSnapshot | null>(null), [error, setError] = useState(""), [time, setTime] = useState(Date.now());
  const latest = useRef<DrawSnapshot | null>(null), clockOffset = useRef(0);
  const [reconnecting, setReconnecting] = useState(!socket.connected), [busy, setBusy] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const activityRef = useRef<HTMLOListElement>(null), activityAtBottom = useRef(true);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null), choiceDialog = useRef<HTMLDivElement>(null);
  const select = usePartyGameChat()?.select;
  useEffect(() => { select?.(true); return () => select?.(false); }, [select]);
  useEffect(() => { heading.current?.focus(); }, [state?.sessionId]);
  useEffect(() => { if (activityAtBottom.current && activityRef.current) activityRef.current.scrollTop = activityRef.current.scrollHeight; }, [state?.feed.at(-1)?.id, messages.at(-1)?.id]);
  useEffect(() => {
    if (!busy && state?.phase === "CHOOSING_WORD" && state.drawerId === userId) choiceDialog.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    else if (state?.drawerId === userId && state.phase === "DRAWING") document.querySelector<HTMLCanvasElement>(".draw-board canvas")?.focus();
  }, [state?.phase, state?.roundId, userId, busy]);
  useEffect(() => {
    const open = () => { if (socket.connected) void socket.timeout(5000).emitWithAck("game:action", { gameType: "draw", roomId, action: { type: "open", roomId } }).then((ack) => { if (!ack.ok) setError(ack.message ?? "Jogo indisponível."); else setError(""); }).catch(() => setError("Servidor não respondeu. Volte aos Jogos para tentar novamente.")); };
    const receive = (snapshot: PartyGameSnapshot | null) => {
      if (snapshot && snapshot.gameType !== "draw") return;
      if (snapshot && snapshot.roomId !== roomId) return;
      const old = latest.current;
      if (snapshot && old && snapshot.sessionId === old.sessionId && (snapshot.revision < old.revision || snapshot.revision === old.revision && snapshot.boardRevision < old.boardRevision)) return;
      latest.current = snapshot; const receivedAt = Date.now(); clockOffset.current = snapshot ? snapshot.serverNow - receivedAt : 0; setTime(receivedAt); setState(snapshot); setReconnecting(false);
      if (!snapshot && old) setError("A sessão terminou. Volte aos Jogos para abrir uma nova partida.");
    };
    const disconnected = () => { setReconnecting(true); setError(""); };
    const receiveState = (metadata: PartyGameState) => { if (metadata.gameType !== "draw") return; const old = latest.current; if (old && old.sessionId === metadata.sessionId && old.roundId === metadata.roundId) receive({ ...metadata, strokes: old.strokes }); else open(); };
    socket.on("game:snapshot", receive); socket.on("game:state", receiveState); socket.on("room:snapshot", open); socket.on("disconnect", disconnected); open();
    const timer = window.setInterval(() => setTime(Date.now()), 250);
    return () => { window.clearInterval(timer); socket.off("game:snapshot", receive); socket.off("game:state", receiveState); socket.off("room:snapshot", open); socket.off("disconnect", disconnected); };
  }, [socket, roomId]);
  const act = (action: GameAction, callback?: (ack: GameAck) => void) => {
    if (!socket.connected || reconnecting) { setError("Aguarde a conexão com a Party."); callback?.({ ok: false }); return; }
    // Canvas batches remain independent; only discrete controls need a click guard.
    const control = action.type !== "stroke" && action.type !== "sync";
    if (control && pending.current) { callback?.({ ok: false }); return; }
    if (control) { pending.current = true; setBusy(true); }
    void socket.timeout(5000).emitWithAck("game:action", { gameType: "draw", roomId, action }).then((ack) => { if (!ack.ok) setError(ack.message ?? "Não foi possível executar a ação."); else setError(""); callback?.(ack); }).catch(() => { setError("Servidor não confirmou a ação. Confira o jogo antes de tentar novamente."); callback?.({ ok: false }); }).finally(() => { if (control) { pending.current = false; setBusy(false); } });
  };
  if (!state) return <div className="draw-loading" role="status">{error || "Abrindo Desenhe e Adivinhe…"}</div>;
  const me = state.players.find((p) => p.id === userId), host = state.hostId === userId, drawer = state.drawerId === userId;
  const unavailable = busy || reconnecting || !socket.connected;
  const remaining = Math.max(0, Math.ceil((state.endsAt - time - clockOffset.current) / 1000));
  const base = { roomId, sessionId: state.sessionId, roundId: state.roundId, revision: state.revision };
  const playing = state.phase !== "LOBBY" && state.phase !== "GAME_RESULT", choosing = drawer && state.phase === "CHOOSING_WORD";
  const drawerName = state.players.find((p) => p.id === state.drawerId)?.displayName ?? "Desenhista";
  const nextDrawer = state.nextDrawerId;
  const topScore = Math.max(0, ...state.players.map((p) => p.score));
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id)).map((p) => p.displayName).join(" e ");
  const role = !me?.online ? "spectator" : drawer ? "drawer" : "guesser";
  const activity = [...state.feed.map((entry) => ({ key: `game-${state.sessionId}-${entry.id}`, time: entry.createdAt ?? 0, kind: "guess" as const, text: entry.text })), ...messages.map((message) => ({ key: `chat-${message.id}`, time: Date.parse(message.createdAt), kind: "chat" as const, text: `${message.user.displayName}: ${message.body}` }))].sort((a, b) => a.time - b.time).slice(-40);
  const roundDuration = Math.max(1, state.endsAt - state.startedAt);
  const progress = Math.min(100, Math.max(0, (remaining * 1000 / roundDuration) * 100));
  return <GameShell game="draw" className={`draw-game draw-v4 is-${role} ${state.phase === "ROUND_RESULT" ? "is-round-result" : ""}`} aria-label="Desenhe e Adivinhe">
    <GameHud className="draw-heading"><div className="draw-hud-main"><span className="draw-role-tag">{state.phase === "LOBBY" ? "Mesa de desenho" : state.phase === "GAME_RESULT" ? "Partida concluída" : role === "drawer" ? "Você desenha" : role === "spectator" ? "Acompanhando" : me?.guessed ? "Você acertou" : "Adivinhe o desenho"}</span><h2 ref={heading} tabIndex={-1}>Desenhe e Adivinhe</h2><p role="status">{state.phase === "LOBBY" ? `${state.players.filter((p) => p.online).length}/12 jogadores` : state.phase === "GAME_RESULT" ? "Resultado da partida" : `Rodada ${state.round} · ${drawerName} ${state.phase === "CHOOSING_WORD" ? "escolhe" : "desenha"}`}</p><span className="draw-match-meta">{drawThemes[state.theme]} · Meta {state.targetScore}</span></div>{playing ? <div className="draw-heading-actions">{me ? <span className="draw-own-score">{me.score}/{state.targetScore} pts</span> : null}<button className="draw-score-toggle" type="button" aria-expanded={showScores} aria-label={`Placar, ${state.players.length} jogadores`} onClick={() => setShowScores((value) => !value)}>Placar · {state.players.length}</button>{me?.online ? <button className="draw-leave" type="button" aria-label="Sair do jogo" title="Sair do jogo" disabled={unavailable} onClick={() => act({ ...base, type: "leave" })}>×</button> : null}</div> : null}</GameHud>
    {error ? <p className="draw-error" role="alert">{error}</p> : null}
    <GameConnectionNotice reconnecting={reconnecting} />
    <div className="draw-content" {...(choosing ? { inert: "" } : {})}>
    {!playing ? <GameLobby className="draw-lobby draw-v4-lobby">
      {state.phase === "LOBBY" ? <div className="draw-lobby-intro"><span aria-hidden="true" className="draw-lobby-mark">✎</span><div><strong>Uma palavra. Muitos jeitos de desenhar.</strong><p>Entre na mesa, escolha o tema e comece quando a turma estiver pronta.</p></div></div> : null}
      {state.phase === "GAME_RESULT" ? <GameResult className="draw-finale"><span>{state.resultReason === "target" ? `Meta ${state.targetScore} alcançada` : "Partida encerrada · faltam jogadores"}</span><h3>{winners ? `${winners} · ${state.winnerIds.length > 1 ? "vitória compartilhada!" : "vitória!"}` : "Até a próxima partida!"}</h3><p>{topScore} pontos</p></GameResult> : null}
      <DrawScoreboard state={state} userId={userId} />
      {state.phase === "LOBBY" ? <fieldset className="draw-match-config" disabled={!host || !me?.online || unavailable}><legend>Partida</legend><div role="group" aria-label="Meta de pontos">{drawTargets.map((target) => <button key={target} type="button" aria-pressed={state.targetScore === target} onClick={() => act({ ...base, type: "configure", targetScore: target, theme: state.theme })}>{target}</button>)}</div><label>Tema<select aria-label="Tema" value={state.theme} onChange={(event) => act({ ...base, type: "configure", targetScore: state.targetScore as 50 | 100 | 150 | 200, theme: event.target.value as typeof state.theme })}>{Object.entries(drawThemes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></fieldset> : null}
      <GameLobbyStatus host={host} hostName={state.players.find((p) => p.id === state.hostId)?.displayName} count={state.players.filter((p) => p.online).length} />
      <GameActionBar className="draw-lobby-actions">{!me?.online ? <button disabled={unavailable} onClick={() => act({ ...base, type: "join" })}>Participar</button> : <button disabled={unavailable} onClick={() => act({ ...base, type: "leave" })}>Sair do jogo</button>}
      {host ? <button className="primary-button" disabled={unavailable || !me?.online || state.players.filter((p) => p.online).length < 2} onClick={() => act({ ...base, type: state.phase === "GAME_RESULT" ? "rematch" : "start" })}>{state.phase === "GAME_RESULT" ? "Jogar novamente" : "Iniciar partida"}</button> : <span>Aguardando o coordenador.</span>}
      {state.phase === "GAME_RESULT" ? <button onClick={onGames}>Voltar aos jogos</button> : null}</GameActionBar>
    </GameLobby> : <div className={`draw-v4-active ${drawer ? "draw-table-drawer" : "draw-table-guesser"}`}>
      <div className={`draw-bottom draw-player-rail ${showScores ? "is-score-open" : ""}`}>
        <div className="draw-rail-heading"><strong>Na mesa</strong><span>{state.players.length}</span></div>
        <DrawScoreboard state={state} userId={userId} />
        <details className="draw-order"><summary>Ordem de desenho · circular</summary><ol>{state.order.map((id) => <li key={id}>{state.players.find((p) => p.id === id)?.displayName ?? "Ausente"}</li>)}</ol></details>
      </div>
      <div className="draw-table">
        <div className="draw-word-wrap"><div className="draw-word-center"><span className="draw-word-label">{state.phase === "ROUND_RESULT" ? "Palavra da rodada" : role === "drawer" ? "Sua palavra" : "Pista"}</span><div className="draw-word" aria-live="polite">{state.phase === "ROUND_RESULT" ? <strong>Era: {state.revealedWord || "Rodada pulada"}</strong> : state.phase === "CHOOSING_WORD" ? <span>{drawerName} está escolhendo…</span> : <strong>{state.secretWord ?? state.maskedWord}</strong>}</div></div><div className="draw-clock"><GameTimer seconds={remaining} unit="clock" />{(state.roundPoints?.[userId] ?? 0) > 0 ? <small className="draw-award">+{state.roundPoints?.[userId]} pts</small> : null}</div></div>
        <DrawCanvas snapshot={state} socket={socket} enabled={!reconnecting && drawer && state.phase === "DRAWING" && socket.connected && remaining > 0} showToolbar={drawer && state.phase === "DRAWING"} controlsDisabled={unavailable} act={act} />
        <div className="draw-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="draw-activity" aria-label="Conversa e palpites da rodada"><div className="draw-activity-title"><strong>Conversa da mesa</strong><span>Mensagens e palpites juntos</span></div>
          {state.phase === "ROUND_RESULT" ? <GameResult className="draw-round-result" role="status"><strong>Rodada encerrada</strong><ul>{state.players.filter((p) => p.guessed).map((p) => <li key={p.id}>{p.displayName} acertou · +{state.roundPoints?.[p.id] ?? 0}</li>)}</ul><p>{nextDrawer ? `A seguir: ${state.players.find((p) => p.id === nextDrawer)?.displayName}` : "A seguir: resultado final"}</p></GameResult> : null}
          <ol ref={activityRef} className="draw-activity-feed" aria-label="Mensagens e palpites" onScroll={(event) => { const node = event.currentTarget; activityAtBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; }}>{activity.length ? activity.map((entry) => <li key={entry.key}><span className={`draw-activity-kind is-${entry.kind}`}>{entry.kind === "guess" ? "Jogo" : "Chat"}</span><span>{entry.text}</span></li>) : <li className="draw-activity-empty">As mensagens e os palpites aparecem aqui.</li>}</ol>
          {children ? <div className="draw-guess-composer">{children}</div> : null}
        </div>
      </div>
    </div>}
    </div>
    {choosing ? <div className="draw-choice-layer"><div ref={choiceDialog} className="draw-choice-dialog" role="dialog" aria-label="Escolha o que você vai desenhar" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== "Tab") return;
      const buttons = [...(choiceDialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }}><div><h3>Escolha o que você vai desenhar</h3><time aria-label="Tempo para escolher">{remaining}s</time></div><div className="draw-choices">{state.choices?.map((word, option) => <button key={word} disabled={unavailable || remaining <= 0} onClick={() => act({ ...base, type: "choose", option })}>{word}</button>)}</div></div></div> : null}
  </GameShell>;
}
