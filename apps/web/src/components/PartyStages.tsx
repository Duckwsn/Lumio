import { useEffect, useRef, useState, type ReactNode } from "react";
import { MonitorUp, Radio, ScreenShare } from "lucide-react";
import type { ScreenShareState } from "@lumio/shared";
import { GameHub, type GameConnection } from "./GameHub";
import { useFullscreenSurface } from "./useFullscreenSurface";

function SharedScreen({ state, stream }: { state: NonNullable<ScreenShareState>; stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="screen-share-stage">{stream ? <video ref={videoRef} autoPlay playsInline /> : <div className="screen-waiting"><MonitorUp size={36} aria-hidden="true" /><strong>Conectando à tela de {state.user.displayName}</strong><span>O compartilhamento aparecerá em instantes.</span></div>}<footer><span className="avatar" style={{ background: state.user.color }}>{state.user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{state.user.displayName} está compartilhando a tela</strong><span>Áudio da call continua independente</span></div></footer></div>;
}

export function MediaExperienceStage({ media, screenShare, screenStream, view, onViewChange }: {
  media: ReactNode; screenShare: ScreenShareState; screenStream: MediaStream | null;
  view: "media" | "screen"; onViewChange: (view: "media" | "screen") => void;
}) {
  return <section className="main-stage media-experience" data-view={view} aria-label="Palco de mídia">
    {screenShare ? <div className="stage-switcher" role="group" aria-label="Escolher visualização"><button className={view === "screen" ? "active" : ""} onClick={() => onViewChange("screen")}><ScreenShare size={16} aria-hidden="true" /> Tela compartilhada</button><button className={view === "media" ? "active" : ""} onClick={() => onViewChange("media")}><Radio size={16} aria-hidden="true" /> Mídia</button></div> : null}
    <div className={view === "media" ? "stage-layer active" : "stage-layer hidden"} aria-hidden={view !== "media"} {...(view !== "media" ? { inert: "" } : {})}>{media}</div>
    {screenShare && view === "screen" ? <div className="stage-layer active"><SharedScreen state={screenShare} stream={screenStream} /></div> : null}
  </section>;
}

export function GamesExperienceStage({ connection, chat, screenShare, screenStream, onFullscreenChange }: {
  connection?: GameConnection; chat?: ReactNode; screenShare: ScreenShareState; screenStream: MediaStream | null;
  onFullscreenChange: (active: boolean) => void;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const [screenVisible, setScreenVisible] = useState(false);
  const { fullscreen, fallbackFullscreen, fullscreenError, toggleFullscreen, setFallbackFullscreen } = useFullscreenSurface(stageRef);
  const gameFullscreen = fullscreen || fallbackFullscreen;
  useEffect(() => { onFullscreenChange(gameFullscreen); }, [gameFullscreen, onFullscreenChange]);
  useEffect(() => () => onFullscreenChange(false), [onFullscreenChange]);
  useEffect(() => { if (!screenShare) setScreenVisible(false); }, [screenShare]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"], .party-drawer, .main-menu-popover, .profile-popover, .mobile-call-menu')) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (gameFullscreen) { event.preventDefault(); setFallbackFullscreen(false); if (document.fullscreenElement === stageRef.current) void document.exitFullscreen(); }
      else if (screenVisible) { event.preventDefault(); setScreenVisible(false); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [gameFullscreen, screenVisible]);
  return <section ref={stageRef} className={`main-stage is-game games-experience ${fallbackFullscreen ? "game-fallback-fullscreen" : ""}`} data-view="game" aria-label="Palco de jogos">
    {screenShare ? <div className="stage-switcher" role="group" aria-label="Escolher visualização"><button className={screenVisible ? "active" : ""} onClick={() => setScreenVisible(true)}><ScreenShare size={16} aria-hidden="true" /> Tela compartilhada</button><button className={!screenVisible ? "active" : ""} onClick={() => setScreenVisible(false)}>Jogos</button></div> : null}
    {screenShare && screenVisible ? <div className="stage-layer active games-screen-layer"><SharedScreen state={screenShare} stream={screenStream} /></div> : <div className="stage-layer game-layer"><GameHub connection={connection} onFullscreen={toggleFullscreen} fullscreen={gameFullscreen} fullscreenChat={gameFullscreen ? chat : null} /></div>}
    {fullscreenError ? <p className="fullscreen-error" role="alert">{fullscreenError}</p> : null}
    {fallbackFullscreen ? <span className="fullscreen-fallback-note">Tela ampliada — tela cheia nativa indisponível neste navegador</span> : null}
    {gameFullscreen ? <span className="fullscreen-rotate-hint">Gire o celular para jogar em paisagem</span> : null}
  </section>;
}
