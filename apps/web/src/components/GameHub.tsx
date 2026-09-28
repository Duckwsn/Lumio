import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type { DrawGame } from "../games/DrawGame";
import { ArrowLeft, Gamepad2, Maximize, Minimize2 } from "lucide-react";

const LazyDrawGame = lazy(() => import("../games/DrawGame").then((module) => ({ default: module.DrawGame })));
export type GameConnection = ComponentProps<typeof DrawGame>;
export function GameHub({ onBack, onFullscreen, fullscreen, connection }: { onBack: () => void; onFullscreen: () => void; fullscreen: boolean; connection?: GameConnection }) {
  const [selected, setSelected] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section className="game-hub" aria-labelledby="game-hub-title">
    <header><button className="quiet-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Voltar à mídia</button>{selected ? <button className="quiet-button" onClick={() => setSelected(false)}>Voltar aos jogos</button> : null}<button className="icon-button" aria-label={fullscreen ? "Sair da tela cheia de Jogos" : "Tela cheia de Jogos"} onClick={onFullscreen}>{fullscreen ? <Minimize2 /> : <Maximize />}</button></header>
    {selected && connection ? <Suspense fallback={<p role="status">Carregando jogo…</p>}><LazyDrawGame {...connection} /></Suspense> : <div className="game-hub-intro"><span className="game-hub-symbol"><Gamepad2 aria-hidden="true" /></span><p className="eyebrow">Na mesma Party</p><h2 ref={titleRef} tabIndex={-1} id="game-hub-title">O que vamos jogar?</h2><p>Desenhe, adivinhe e ria junto com a turma.</p><button className="draw-entry" disabled={!connection} onClick={() => setSelected(true)}><strong>Desenhe e Adivinhe</strong><span>2–12 pessoas · duas voltas · participação opcional</span></button><span className="game-hub-note">O chat, a mídia e a voz continuam na mesma Party.</span></div>}
  </section>;
}
