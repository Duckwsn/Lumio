import { useEffect, useRef, useState } from "react";
import { quizCategories, quizCounts, quizDifficulties, type QuizAction, type QuizSnapshot, type PartyGameSnapshot, type PartyGameState } from "@lumio/shared";
import type { GameConnection } from "../components/GameHub";
import { GameScoreboard } from "./GameScoreboard";

export function QuizGame({ socket, roomId, userId }: GameConnection) {
  const [state, setState] = useState<QuizSnapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  const latest = useRef<QuizSnapshot | null>(null), offset = useRef(0), pending = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const receive = (s: PartyGameSnapshot | PartyGameState | null) => {
      if (s && (s.roomId !== roomId || s.gameType !== "quiz")) return;
      if (s && latest.current?.sessionId === s.sessionId && latest.current.revision > s.revision) return;
      latest.current = s; setState(s); offset.current = s ? s.serverNow - Date.now() : 0;
    };
    const open = () => { if (socket.connected) void socket.timeout(5000).emitWithAck("game:action", { gameType: "quiz", type: "open", roomId }).then((a) => setError(a.ok ? "" : a.message ?? "Quiz indisponível.")).catch(() => setError("Servidor não respondeu. Volte ao Hub para tentar novamente.")); };
    const disconnect = () => { latest.current = null; setState(null); setError("Reconectando à Party…"); };
    socket.on("game:snapshot", receive); socket.on("game:state", receive); socket.on("room:snapshot", open); socket.on("disconnect", disconnect); open();
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => { window.clearInterval(timer); socket.off("game:snapshot", receive); socket.off("game:state", receive); socket.off("room:snapshot", open); socket.off("disconnect", disconnect); };
  }, [socket, roomId]);
  useEffect(() => { heading.current?.focus(); }, [state?.roundId, state?.phase]);
  const act = async (action: QuizAction) => {
    if (pending.current || !socket.connected) return;
    pending.current = true; setBusy(true);
    try { const ack = await socket.timeout(5000).emitWithAck("game:action", action); setError(ack.ok ? "" : ack.message ?? "Ação recusada."); }
    catch { setError("Servidor não respondeu. A ação não foi confirmada."); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!state) return <p role="status">{error || "Abrindo Quiz…"}</p>;
  const me = state.players.find((p) => p.id === userId), host = state.hostId === userId;
  const base = { gameType: "quiz" as const, roomId, sessionId: state.sessionId, roundId: state.roundId, revision: state.revision };
  const remaining = Math.max(0, Math.ceil((state.endsAt - now - offset.current) / 1000));
  const configure = (change: Partial<Pick<QuizSnapshot, "category" | "difficulty" | "questionCount">>) => act({ ...base, type: "configure", category: state.category, difficulty: state.difficulty, questionCount: state.questionCount as 5 | 10 | 15 | 20, ...change } as QuizAction);
  const playing = state.phase === "QUESTION" || state.phase === "REVEAL", locked = state.ownAnswer !== undefined;
  return <section className="quiz-game" data-phase={state.phase} aria-label="Quiz">
    <header className="quiz-heading"><div><h2 ref={heading} tabIndex={-1}>Quiz</h2><p>{playing ? `Pergunta ${state.round} de ${state.questionCount}` : state.phase === "LOBBY" ? `${state.players.filter((p) => p.online).length}/12 jogadores` : "Partida concluída"}</p><small>{quizCategories[state.category]} · {quizDifficulties[state.difficulty]}</small></div>{playing ? <div><time aria-label="Tempo restante" className={remaining <= 5 ? "is-ending" : ""}>{remaining}s</time>{me ? <small>{me.score} pontos</small> : null}</div> : null}</header>
    {error ? <p role="alert" className="draw-error">{error}</p> : null}
    {playing && state.question ? <>
      <h3 className="quiz-question">{state.question.prompt}</h3>
      <div className="quiz-answers">{state.question.answers.map((answer, option) => <button key={option} className={state.reveal ? option === state.reveal.correctIndex ? "correct" : option === state.ownAnswer ? "incorrect" : "" : option === state.ownAnswer ? "selected" : ""} aria-pressed={state.ownAnswer === option} disabled={busy || locked || !me?.online || state.phase !== "QUESTION" || remaining <= 0 || !socket.connected} onClick={() => { void act({ ...base, type: "answer", option }); }}><span className="quiz-option-letter">{String.fromCharCode(65 + option)}</span><span>{answer}</span>{state.reveal ? <small>{option === state.reveal.correctIndex ? "✓ Correta · " : ""}{state.reveal.distribution[option]} respostas</small> : state.ownAnswer === option ? <small>Enviada</small> : null}</button>)}</div>
      <p className="quiz-answer-status" role="status">{state.phase === "REVEAL" ? me ? state.ownAnswer === undefined ? "Não respondeu · +0" : state.reveal?.ownCorrect ? `Você acertou · +${state.reveal.ownPoints}` : "Você errou · +0" : "Resultado da pergunta" : locked ? "Resposta enviada. Aguarde o resultado." : me?.online ? "Toque em uma alternativa para responder." : "Observando · participe na próxima partida."}</p>
      {state.phase === "QUESTION" ? <small>{state.answeredCount}/{state.eligibleCount} responderam · evite contar a resposta no Chat ou na voz.</small> : <GameScoreboard players={state.players} userId={userId} />}
    </> : <>
      {state.phase === "RESULT" ? <div className="quiz-finale"><h3>{state.winnerIds.length ? `${state.players.filter((p) => state.winnerIds.includes(p.id)).map((p) => p.displayName).join(" e ")} · ${state.winnerIds.length > 1 ? "vitória compartilhada!" : "vitória!"}` : "Partida encerrada · faltam jogadores"}</h3></div> : null}
      <GameScoreboard players={state.players} userId={userId} />
      {state.phase === "LOBBY" ? <fieldset className="quiz-config" disabled={!host || !me?.online || busy}><legend>Partida</legend><div role="group" aria-label="Quantidade de perguntas">{quizCounts.map((count) => <button key={count} aria-pressed={state.questionCount === count} onClick={() => { void configure({ questionCount: count }); }}>{count}</button>)}</div><label>Categoria<select value={state.category} onChange={(e) => { void configure({ category: e.target.value as QuizSnapshot["category"] }); }}>{Object.entries(quizCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Dificuldade<select value={state.difficulty} onChange={(e) => { void configure({ difficulty: e.target.value as QuizSnapshot["difficulty"] }); }}>{Object.entries(quizDifficulties).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></fieldset> : null}
      <p>{host ? "Você coordena." : "Aguardando o coordenador."} Mínimo de 2 participantes.</p>
      <div className="draw-lobby-actions"><button disabled={busy} onClick={() => { void act({ ...base, type: me?.online ? "leave" : "join" }); }}>{me?.online ? "Sair do jogo" : "Participar"}</button>{host ? <button className="primary-button" disabled={busy || !me?.online || state.players.filter((p) => p.online).length < 2} onClick={() => { void act({ ...base, type: state.phase === "LOBBY" ? "start" : "rematch" }); }}>{state.phase === "LOBBY" ? "Iniciar partida" : "Jogar novamente"}</button> : null}</div>
    </>}
  </section>;
}
