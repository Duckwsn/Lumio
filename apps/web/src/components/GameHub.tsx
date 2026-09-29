import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { DrawGame } from "../games/DrawGame";
import { ArrowLeft, Maximize, Minimize2 } from "lucide-react";
import { gameRegistry, type GameType, type PartyGameSnapshot, type PartyGameState } from "@lumio/shared";

const LazyDrawGame = lazy(() => import("../games/DrawGame").then((module) => ({ default: module.DrawGame })));
const LazyQuizGame = lazy(() => import("../games/QuizGame").then((module) => ({ default: module.QuizGame })));
const LazyCardGame = lazy(() => import("../games/CardGame").then((module) => ({ default: module.CardGame })));
export type GameConnection = Pick<ComponentProps<typeof DrawGame>, "socket" | "roomId" | "userId">;
export function GameHub({ onBack, onFullscreen, fullscreen, connection, fullscreenChat }: { onBack: () => void; onFullscreen: () => void; fullscreen: boolean; connection?: GameConnection; fullscreenChat?: ReactNode }) {
  const [selected, setSelected] = useState<GameType | null>(null);
  const [active, setActive] = useState<Pick<PartyGameSnapshot, "gameType" | "sessionId" | "roundId" | "revision" | "hostId"> | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false), [error, setError] = useState(""), [ending, setEnding] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const socket = connection?.socket, roomId = connection?.roomId; if (!socket) return;
    const receive = (s: PartyGameSnapshot | PartyGameState | null) => { if (s && s.roomId !== roomId) return; setActive(s ? { gameType: s.gameType, sessionId: s.sessionId, roundId: s.roundId, revision: s.revision, hostId: s.hostId } : null); };
    socket.on("game:snapshot", receive); socket.on("game:state", receive);
    if (socket.connected && roomId) void socket.timeout(5000).emitWithAck("game:action", { type: "inspect", roomId }).catch(() => setError("Não foi possível consultar a sessão atual."));
    // room:join already carries the active session; reopening a selected game
    // fetches its projection without a second socket or new Party.
    return () => { socket.off("game:snapshot", receive); socket.off("game:state", receive); };
  }, [connection?.socket, connection?.roomId]);
  const backToHub = () => { setSelected(null); setConfirmEnd(false); setError(""); requestAnimationFrame(() => titleRef.current?.focus()); };
  const end = async () => {
    if (!active || !connection || ending) return; setEnding(true);
    try { const ack = await connection.socket.timeout(5000).emitWithAck("game:action", { type: "end", gameType: active.gameType, roomId: connection.roomId, sessionId: active.sessionId, roundId: active.roundId, revision: active.revision }); if (ack.ok) { backToHub(); setActive(null); } else setError(ack.message ?? "Não foi possível encerrar."); }
    catch { setError("Servidor não confirmou o encerramento."); } finally { setEnding(false); }
  };
  const conflict = active && selected && active.gameType !== selected;
  return <section className="game-hub" aria-label="Jogos da Party">
    <header className="game-stage-nav"><nav aria-label="Navegação de Jogos"><button className="quiet-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Voltar à mídia</button><span aria-hidden="true">/</span>{selected ? <><button className="game-breadcrumb" aria-label="Voltar aos jogos" onClick={backToHub}>Jogos</button><span aria-hidden="true">/</span><span className="game-current">{gameRegistry.find((g) => g.id === selected)?.name}</span></> : <span className="game-current">Jogos</span>}</nav><button className="icon-button" aria-label={fullscreen ? "Sair da tela cheia de Jogos" : "Tela cheia de Jogos"} onClick={onFullscreen}>{fullscreen ? <Minimize2 /> : <Maximize />}</button></header>
    {error ? <p role="alert">{error}</p> : null}
    {conflict ? <p role="status">Há uma sessão de {gameRegistry.find((g) => g.id === active.gameType)?.name}. Retorne a ela ou peça ao coordenador para encerrá-la.<button onClick={() => setSelected(active.gameType)}>Retornar à partida</button></p> : selected && connection ? <Suspense fallback={<p role="status">Carregando jogo…</p>}>{selected === "draw" ? <LazyDrawGame {...connection} onGames={backToHub} onMedia={onBack}>{fullscreenChat}</LazyDrawGame> : selected === "quiz" ? <LazyQuizGame {...connection} /> : <LazyCardGame {...connection} />}</Suspense> : <div className="game-hub-intro"><h2 ref={titleRef} tabIndex={-1} id="game-hub-title">O que vamos jogar?</h2><div className="game-catalog">{gameRegistry.map((game) => <button key={game.id} className={`${game.id}-entry`} disabled={!connection} onClick={() => setSelected(game.id)}>{game.id === "draw" ? <DrawGameIcon /> : game.id === "quiz" ? <QuizGameIcon /> : <CardGameIcon />}<strong>{game.name}</strong><span>{game.minPlayers}–{game.maxPlayers} jogadores</span></button>)}</div></div>}
    {active ? <footer className="game-session-tools">{active.hostId === connection?.userId ? confirmEnd ? <div role="group" aria-label="Confirmar encerramento do jogo"><span>Encerrar a sessão para todos? Pontos e progresso serão descartados.</span><button disabled={ending} onClick={() => { void end(); }}>Confirmar encerramento</button><button disabled={ending} onClick={() => setConfirmEnd(false)}>Cancelar</button></div> : <button onClick={() => setConfirmEnd(true)}>Encerrar sessão de jogo</button> : null}</footer> : null}
  </section>;
}

/** Original code-native artwork, not a third-party game asset. */
export function DrawGameIcon() { return <svg className="draw-game-icon" viewBox="0 0 120 100" fill="none" aria-hidden="true"><rect x="10" y="12" width="100" height="76" rx="18" fill="currentColor" opacity=".1" /><path d="M24 65c13-30 18 18 35-2s17 2 29-9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="m64 37 21-21 13 13-21 21-17 4 4-17Z" fill="#dbac54" /><path d="m85 16 13 13M64 37l13 13" stroke="#26332c" strokeWidth="3" /><circle cx="31" cy="35" r="4" fill="currentColor" /></svg>; }
export function QuizGameIcon() { return <svg className="draw-game-icon" viewBox="0 0 120 100" fill="none" aria-hidden="true"><rect x="10" y="12" width="100" height="76" rx="18" fill="currentColor" opacity=".1" /><path d="M47 34a13 13 0 0 1 26 0c0 10-13 9-13 20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><circle cx="60" cy="65" r="3" fill="currentColor" /><path d="M28 77h20m7 0h16m7 0h14" stroke="#dbac54" strokeWidth="4" strokeLinecap="round" /></svg>; }
export function CardGameIcon() { return <svg className="draw-game-icon" viewBox="0 0 120 100" fill="none" aria-hidden="true"><rect x="20" y="19" width="44" height="64" rx="10" transform="rotate(-12 20 19)" stroke="currentColor" strokeWidth="3" /><rect x="55" y="16" width="44" height="64" rx="10" fill="currentColor" opacity=".16" stroke="currentColor" strokeWidth="3" /><path d="m77 34 10 14-10 14-10-14 10-14Z" fill="#dbac54" /></svg>; }
