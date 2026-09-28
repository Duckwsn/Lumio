import { useEffect, useRef } from "react";
import { ArrowLeft, Gamepad2, Maximize, Minimize2 } from "lucide-react";

/** G0 is presentation only. G1 can supply a game experience at this boundary. */
export function GameHub({ onBack, onFullscreen, fullscreen }: { onBack: () => void; onFullscreen: () => void; fullscreen: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section className="game-hub" aria-labelledby="game-hub-title">
    <header><button className="quiet-button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Voltar à mídia</button><button className="icon-button" aria-label={fullscreen ? "Sair da tela cheia de Jogos" : "Tela cheia de Jogos"} onClick={onFullscreen}>{fullscreen ? <Minimize2 /> : <Maximize />}</button></header>
    <div className="game-hub-intro"><span className="game-hub-symbol"><Gamepad2 aria-hidden="true" /></span><p className="eyebrow">Na mesma Party</p><h2 ref={titleRef} tabIndex={-1} id="game-hub-title">O que vamos jogar?</h2><p>Um novo jeito de reunir a turma está chegando.</p><span className="game-hub-note">Os jogos ainda estão em preparação. Enquanto isso, o chat e a voz continuam por aqui.</span></div>
  </section>;
}
