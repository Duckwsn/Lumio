import { useEffect, useRef, type ReactNode } from "react";
import { MonitorUp, Radio, ScreenShare } from "lucide-react";
import type { ScreenShareState } from "@lumio/shared";
import { GameHub, type GameConnection } from "./GameHub";
import { useFullscreenSurface } from "./useFullscreenSurface";

export type MainStageView = "media" | "screen" | "game";

export function MainStage({ media, screenShare, screenStream, view, onViewChange, youtubeVisible = false, onFullscreenChange, gameConnection }: {
  gameConnection?: GameConnection;
  media: ReactNode;
  screenShare: ScreenShareState;
  screenStream: MediaStream | null;
  view: MainStageView;
  onViewChange: (view: MainStageView) => void;
  youtubeVisible?: boolean;
  onFullscreenChange: (active: boolean) => void;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const { fullscreen, fallbackFullscreen, fullscreenError, toggleFullscreen, setFallbackFullscreen } = useFullscreenSurface(stageRef);
  const gameFullscreen = fullscreen || fallbackFullscreen;
  const returnToMedia = () => {
    setFallbackFullscreen(false);
    if (document.fullscreenElement === stageRef.current) void document.exitFullscreen();
    onViewChange("media");
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".games-entry")?.focus());
  };
  useEffect(() => { onFullscreenChange(gameFullscreen); }, [gameFullscreen, onFullscreenChange]);
  useEffect(() => () => onFullscreenChange(false), [onFullscreenChange]);
  useEffect(() => {
    if (view !== "game") return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"], .party-drawer, .main-menu-popover, .profile-popover, .mobile-call-menu')) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      if (gameFullscreen) { setFallbackFullscreen(false); if (document.fullscreenElement === stageRef.current) void document.exitFullscreen(); }
      else returnToMedia();
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [view, gameFullscreen, onViewChange]);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = screenStream;
    if (screenStream) void videoRef.current.play().catch(() => undefined);
    return () => { if (videoRef.current) videoRef.current.srcObject = null; };
  }, [screenStream, Boolean(screenShare)]);

  return <section ref={stageRef} className={`main-stage ${view === "game" ? "is-game" : ""} ${fallbackFullscreen ? "game-fallback-fullscreen" : ""}`} data-view={view} aria-label="Palco principal">
    {screenShare ? <div className="stage-switcher" role="group" aria-label="Escolher visualização"><button className={view === "screen" ? "active" : ""} onClick={() => { setFallbackFullscreen(false); onViewChange("screen"); }}><ScreenShare size={16} aria-hidden="true" /> Tela compartilhada</button><button className={view === "media" ? "active" : ""} onClick={returnToMedia}><Radio size={16} aria-hidden="true" /> Mídia</button></div> : null}
    <div className={view === "media" ? "stage-layer active" : view === "game" && youtubeVisible ? "stage-layer game-media-visible" : "stage-layer hidden"} aria-hidden={view !== "media" && !(view === "game" && youtubeVisible)} {...(view !== "media" && !(view === "game" && youtubeVisible) ? { inert: "" } : {})}>{media}</div>
    {screenShare ? <div className={view === "screen" ? "stage-layer active" : "stage-layer hidden"} aria-hidden={view !== "screen"} {...(view !== "screen" ? { inert: "" } : {})}><div className="screen-share-stage">{screenStream ? <video ref={videoRef} autoPlay playsInline /> : <div className="screen-waiting"><MonitorUp size={36} aria-hidden="true" /><strong>Conectando à tela de {screenShare.user.displayName}</strong><span>O compartilhamento aparecerá em instantes.</span></div>}<footer><span className="avatar" style={{ background: screenShare.user.color }}>{screenShare.user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{screenShare.user.displayName} está compartilhando a tela</strong><span>Áudio da call continua independente</span></div></footer></div></div> : null}
    {view === "game" ? <div className="stage-layer game-layer"><GameHub connection={gameConnection} onBack={returnToMedia} onFullscreen={toggleFullscreen} fullscreen={gameFullscreen} /></div> : null}
    {view === "game" && fullscreenError ? <p className="fullscreen-error" role="alert">{fullscreenError}</p> : null}
    {view === "game" && fallbackFullscreen ? <span className="fullscreen-fallback-note">Tela ampliada — tela cheia nativa indisponível neste navegador</span> : null}
    {view === "game" && gameFullscreen ? <span className="fullscreen-rotate-hint">Gire o celular para jogar em paisagem</span> : null}
  </section>;
}
