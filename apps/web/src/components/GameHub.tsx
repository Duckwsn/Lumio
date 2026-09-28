import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { DrawGame } from "../games/DrawGame";
import { ArrowLeft, Maximize, Minimize2 } from "lucide-react";

const LazyDrawGame = lazy(() => import("../games/DrawGame").then((module) => ({ default: module.DrawGame })));
export type GameConnection = Pick<ComponentProps<typeof DrawGame>, "socket" | "roomId" | "userId">;
export function GameHub({ onBack, onFullscreen, fullscreen, connection, fullscreenChat }: { onBack: () => void; onFullscreen: () => void; fullscreen: boolean; connection?: GameConnection; fullscreenChat?: ReactNode }) {
  const [selected, setSelected] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section className="game-hub" aria-labelledby="game-hub-title">
    <header><button className="quiet-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Voltar à mídia</button>{selected ? <button className="quiet-button" onClick={() => setSelected(false)}>Voltar aos jogos</button> : null}<button className="icon-button" aria-label={fullscreen ? "Sair da tela cheia de Jogos" : "Tela cheia de Jogos"} onClick={onFullscreen}>{fullscreen ? <Minimize2 /> : <Maximize />}</button></header>
    {selected && connection ? <Suspense fallback={<p role="status">Carregando jogo…</p>}><LazyDrawGame {...connection} onGames={() => setSelected(false)} onMedia={onBack}>{fullscreenChat}</LazyDrawGame></Suspense> : <div className="game-hub-intro"><h2 ref={titleRef} tabIndex={-1} id="game-hub-title">O que vamos jogar?</h2><div className="game-catalog"><button className="draw-entry" disabled={!connection} onClick={() => setSelected(true)}><DrawGameIcon /><strong>Desenhe e Adivinhe</strong><span>2–12 jogadores</span></button></div></div>}
  </section>;
}

/** Original code-native artwork, not a third-party game asset. */
export function DrawGameIcon() { return <svg className="draw-game-icon" viewBox="0 0 120 100" fill="none" aria-hidden="true"><rect x="10" y="12" width="100" height="76" rx="18" fill="currentColor" opacity=".1" /><path d="M24 65c13-30 18 18 35-2s17 2 29-9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="m64 37 21-21 13 13-21 21-17 4 4-17Z" fill="#dbac54" /><path d="m85 16 13 13M64 37l13 13" stroke="#26332c" strokeWidth="3" /><circle cx="31" cy="35" r="4" fill="currentColor" /></svg>; }
