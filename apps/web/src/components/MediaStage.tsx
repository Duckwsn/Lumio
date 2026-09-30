import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Clapperboard, Gauge, Maximize, Minimize2, Pause, Play, Plus, RotateCcw, SkipForward, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { MediaState } from "@lumio/shared";
import { ambientMetadata } from "../media/AmbientPresentation";
import { AmbientArtwork } from "./AmbientArtwork";
import { useFullscreenSurface } from "./useFullscreenSurface";
import { DriveProvider, MediaController, YouTubeProvider, type ProviderCapabilities, type ProviderEvent } from "../media/MediaProvider";

type PlaybackCommand = { action: "play" | "pause" | "seek" | "rate"; position: number; playbackRate?: number };
const emptyCapabilities: ProviderCapabilities = { playPause: false, seek: false, volume: false, mute: false, playbackRate: false, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
export const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "--:--";
  const seconds = Math.floor(value);
  const minutes = Math.floor(seconds / 60);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${(minutes % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
    : `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
};
const isEditableTarget = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node?.isContentEditable || node?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], button, [role="slider"]')); };

export function MediaStage({ media, roomId, onSkip, onRemove, onAddMedia, onPlaybackCommand, onEnded, apiUrl, token, theater, onTheaterChange, ambient, musicView, onMusicViewChange, onFullscreenChange, volume, effectiveVolume, onVolumeChange, resyncToken, shortcutsEnabled = true }: {
  media: MediaState; roomId: string; onSkip: () => void; onRemove: () => void; onAddMedia: () => void;
  onPlaybackCommand: (command: PlaybackCommand) => boolean; onEnded: () => void;
  apiUrl: string; token: string; theater: boolean; onTheaterChange: (active: boolean) => void; ambient: boolean; musicView: boolean;
  onMusicViewChange: (active: boolean) => void; onFullscreenChange: (active: boolean) => void;
  volume: number; effectiveVolume: number; onVolumeChange: (volume: number) => void; resyncToken: number;
  shortcutsEnabled?: boolean;
}) {
  const stageRef = useRef<HTMLElement>(null); const iframeRef = useRef<HTMLIFrameElement>(null); const videoRef = useRef<HTMLVideoElement>(null); const controllerRef = useRef<MediaController | null>(null); const endedKeyRef = useRef(""); const hideTimer = useRef<number>(); const seekingRef = useRef(false); const mediaIdentityRef = useRef({ id: media.mediaId, revision: media.revision }); const onEndedRef = useRef(onEnded);
  const { fullscreen, fallbackFullscreen, fullscreenError, toggleFullscreen, setFallbackFullscreen } = useFullscreenSurface(stageRef);
  const appliedVolume = useRef(effectiveVolume);
  const pointerActive = useRef(false);
  const touchInput = useRef(false);
  const [autoplayDenied, setAutoplayDenied] = useState(false);
  const [providerError, setProviderError] = useState(""); const [providerState, setProviderState] = useState(media.state); const [position, setPosition] = useState(media.position); const [duration, setDuration] = useState(media.duration); const [seeking, setSeeking] = useState(false); const [muted, setMuted] = useState(false); const [capabilities, setCapabilities] = useState(emptyCapabilities); const [rates, setRates] = useState<number[]>([1]); const [controlsVisible, setControlsVisible] = useState(true);
  const empty = media.provider === "demo" || !media.mediaId;
  useEffect(() => { onFullscreenChange(fullscreen || fallbackFullscreen); }, [fullscreen, fallbackFullscreen, onFullscreenChange]);
  useEffect(() => () => onFullscreenChange(false), [onFullscreenChange]);
  const autoplayBlocked = media.state === "playing" && (autoplayDenied || /NotAllowedError|play\(\) failed|autoplay|user gesture|user interaction/i.test(providerError));
  const visibleError = providerError && !autoplayBlocked;
  const showLoading = !empty && !capabilities.playPause && !visibleError && !autoplayBlocked;
  const showBuffering = providerState === "buffering" && media.state === "playing";

  mediaIdentityRef.current = { id: media.mediaId, revision: media.revision }; onEndedRef.current = onEnded;
  const onProviderEvent = useCallback((event: ProviderEvent) => {
    if (event.type === "error") setProviderError(event.message);
    else if (event.type === "autoplay-blocked") setAutoplayDenied(true);
    else if (event.type === "duration") { if (Number.isFinite(event.duration) && event.duration >= 0) setDuration(event.duration); }
    else { setProviderState(event.type); if (event.type === "playing") { setAutoplayDenied(false); setProviderError(""); } if (event.type === "ended") { const identity = mediaIdentityRef.current; const key = `${identity.id}:${identity.revision}`; if (endedKeyRef.current !== key) { endedKeyRef.current = key; onEndedRef.current(); } } }
  }, []);

  useEffect(() => {
    controllerRef.current?.destroy(); controllerRef.current = null; setProviderError(""); setCapabilities(emptyCapabilities);
    setAutoplayDenied(false);
    if (empty) { setProviderState("idle"); return; }
    const controller = new MediaController({ youtube: () => new YouTubeProvider(iframeRef.current!, onProviderEvent), "google-drive": () => new DriveProvider(videoRef.current!, apiUrl, token, roomId, onProviderEvent) }, setProviderError);
    controllerRef.current = controller; return () => controller.destroy();
  }, [apiUrl, empty, media.provider, onProviderEvent, roomId, token]);
  useEffect(() => { setAutoplayDenied(false); setProviderError(""); setCapabilities(emptyCapabilities); setDuration(media.duration); }, [media.mediaId, media.provider]);
  useEffect(() => { if (media.state !== "playing") setAutoplayDenied(false); }, [media.state]);

  useEffect(() => {
    if (empty) return;
    const controller = controllerRef.current;
    const identity = { id: media.mediaId, revision: media.revision };
    void controller?.sync(media, { force: resyncToken > 0 }).then(() => { if (controller !== controllerRef.current || mediaIdentityRef.current.id !== identity.id || mediaIdentityRef.current.revision !== identity.revision) return; controller.setVolume(appliedVolume.current); setCapabilities(controller.getCapabilities()); setRates(controller.getAvailablePlaybackRates?.() ?? [1]); });
    if (!seekingRef.current) setPosition(media.position); setDuration(media.duration); setProviderState(media.state);
  }, [empty, media, resyncToken]);
  useEffect(() => {
    const from = appliedVolume.current; const started = performance.now(); const duration = effectiveVolume < from ? 180 : 380;
    if (Math.abs(effectiveVolume - from) < 1) { appliedVolume.current = effectiveVolume; controllerRef.current?.setVolume(effectiveVolume); return; }
    const timer = window.setInterval(() => { const progress = Math.min(1, (performance.now() - started) / duration); const eased = 1 - (1 - progress) ** 2; appliedVolume.current = from + (effectiveVolume - from) * eased; controllerRef.current?.setVolume(appliedVolume.current); if (progress >= 1) window.clearInterval(timer); }, 40);
    return () => window.clearInterval(timer);
  }, [effectiveVolume]);
  useEffect(() => { controllerRef.current?.setMuted(muted); }, [muted, media.provider]);
  useEffect(() => { if (empty || seeking || providerState !== "playing") return; const timer = window.setInterval(() => { const value = controllerRef.current?.getCurrentTime() ?? 0; if (value >= 0) setPosition(value); }, 500); return () => window.clearInterval(timer); }, [empty, providerState, seeking]);

  const issue = useCallback((action: PlaybackCommand["action"], nextPosition = controllerRef.current?.getCurrentTime() ?? position, playbackRate?: number) => { if (!onPlaybackCommand({ action, position: Math.max(0, nextPosition), playbackRate })) return; const controller = controllerRef.current; if (action === "play") void Promise.resolve(controller?.play()).catch((error: unknown) => setProviderError(error instanceof Error ? error.message : "Não foi possível iniciar a reprodução.")); else if (action === "pause") void controller?.pause(); else if (action === "seek") void controller?.seek(nextPosition); else if (playbackRate) controller?.setPlaybackRate(playbackRate); }, [onPlaybackCommand, position]);
  const togglePlayback = useCallback(() => issue(providerState === "playing" ? "pause" : "play"), [issue, providerState]);
  const revealControls = useCallback(() => {
    setControlsVisible(true); window.clearTimeout(hideTimer.current);
    if (media.state === "playing") hideTimer.current = window.setTimeout(() => {
      const focus = stageRef.current?.querySelector(".lumio-controls:focus-within");
      if (!seekingRef.current && !pointerActive.current && !focus) setControlsVisible(false);
    }, 2600);
  }, [media.state]);
  useEffect(() => { revealControls(); }, [media.mediaId, fullscreen, fallbackFullscreen, revealControls]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!shortcutsEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && fallbackFullscreen) { event.preventDefault(); setFallbackFullscreen(false); return; }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target) || empty || document.querySelector('[role="dialog"], .main-menu-popover, .profile-popover, .mobile-call-menu, .media-hub-overlay')) return;
      if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); togglePlayback(); }
      else if (event.key.toLowerCase() === "m") { event.preventDefault(); setMuted((value) => !value); }
      else if (event.key.toLowerCase() === "f" || (event.key === "Escape" && fallbackFullscreen)) { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === "ArrowLeft" && capabilities.seek) { event.preventDefault(); issue("seek", Math.max(0, (controllerRef.current?.getCurrentTime() ?? position) - 10)); }
      else if (event.key === "ArrowRight" && capabilities.seek && duration > 0) { event.preventDefault(); issue("seek", Math.min(duration, (controllerRef.current?.getCurrentTime() ?? position) + 10)); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsEnabled, capabilities.seek, duration, empty, fallbackFullscreen, issue, position, toggleFullscreen, togglePlayback]);

  const presentation = ambientMetadata(media);
  const ambientThumbnail = presentation.artwork;
  const visualStyle = ambient && ambientThumbnail ? { "--ambient-image": `url("${ambientThumbnail.split('"').join('%22')}")` } as CSSProperties : undefined;
  return <section ref={stageRef} className={`universal-player lumio-player ${theater ? "is-theater" : ""} ${ambient && !empty ? "has-ambient" : ""} ${musicView ? "is-music-view" : ""} ${media.provider === "youtube" ? "has-youtube" : ""} ${visibleError ? "has-media-error" : ""} ${fallbackFullscreen ? "fallback-fullscreen" : ""} ${controlsVisible || media.state !== "playing" ? "controls-visible" : ""}`} style={visualStyle} aria-label="Lumio Player" onPointerMove={(event) => { if (event.pointerType === "mouse") revealControls(); }} onFocusCapture={revealControls} onBlurCapture={revealControls}>
    <div className="player-frame"><div key={ambientThumbnail ?? media.mediaId} className="ambient-glow" aria-hidden="true" />
      {empty ? <div className="player-empty"><span className="player-empty-icon"><Clapperboard aria-hidden="true" /></span><h2>Nenhuma mídia tocando</h2><p>Adicione um vídeo ou uma música para começar a Party.</p><button className="primary-action" onClick={onAddMedia}><Plus size={18} /> Adicionar mídia</button></div> : null}
      {media.provider === "youtube" && media.mediaId ? <iframe ref={iframeRef} className="provider-player" title={media.title} src={`https://www.youtube-nocookie.com/embed/${media.mediaId}?enablejsapi=1&origin=${window.location.origin}&controls=0&disablekb=1&rel=0&playsinline=1`} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : null}
      {media.provider === "google-drive" && media.mediaId ? <video ref={videoRef} className="provider-player" playsInline preload="metadata" poster={media.thumbnail} /> : null}
      {!empty ? <div className="player-touch-surface" aria-hidden="true" onPointerDown={(event) => { touchInput.current = event.pointerType !== "mouse"; revealControls(); }} /> : null}
      {musicView && !empty && !visibleError && !autoplayBlocked ? <div className="music-presentation" aria-label="Apresentação Ambiente" data-lyrics={presentation.lyrics.available ? "available" : "unavailable"}><AmbientArtwork key={ambientThumbnail ?? media.mediaId} source={ambientThumbnail} /><div className="ambient-copy"><span>Na Party</span><strong>{presentation.title}</strong><small>{presentation.channel}</small></div></div> : null}
      {!empty && (showLoading || showBuffering) ? <div className="player-buffering" role="status"><span /> {showBuffering ? "Aguardando vídeo…" : media.provider === "google-drive" ? "Preparando vídeo do Drive…" : "Preparando vídeo…"}</div> : null}
      {visibleError || autoplayBlocked ? <div className="player-error" role="alert"><strong>{autoplayBlocked ? "Toque para continuar" : "Não foi possível reproduzir esta mídia"}</strong><p>{autoplayBlocked ? "O navegador exige um toque para continuar no ponto atual da Party." : media.provider === "google-drive" ? "Verifique o acesso ao arquivo no Google Drive ou escolha outra mídia." : "Este vídeo pode estar indisponível para reprodução incorporada. Escolha outra mídia."}</p><div>{autoplayBlocked ? <button onClick={() => { void Promise.resolve(controllerRef.current?.resumeFromGesture()).then(() => { setAutoplayDenied(false); setProviderError(""); }).catch(() => setProviderError("Não foi possível iniciar a reprodução.")); }}><Play size={17} /> Continuar</button> : <button onClick={() => { setProviderError(""); void controllerRef.current?.sync(media, { force: true }).then(() => { if (controllerRef.current) setCapabilities(controllerRef.current.getCapabilities()); }); }}><RotateCcw size={17} /> Tentar novamente</button>}<button onClick={onAddMedia}><Plus size={17} /> Escolher outra mídia</button>{!autoplayBlocked ? <button onClick={onSkip}><SkipForward size={17} /> Pular</button> : null}{!autoplayBlocked ? <button className="danger-action" onClick={onRemove}>Remover</button> : null}</div></div> : null}
      {!empty ? <div className="lumio-controls" aria-label="Controles do Lumio Player" onPointerDown={(event) => { pointerActive.current = true; touchInput.current = event.pointerType !== "mouse"; window.clearTimeout(hideTimer.current); }} onPointerUp={(event) => { pointerActive.current = false; if ((event.target as HTMLElement).matches("button") || touchInput.current && !(event.target instanceof HTMLSelectElement)) (event.target as HTMLElement).blur(); revealControls(); }} onPointerCancel={() => { pointerActive.current = false; seekingRef.current = false; setSeeking(false); revealControls(); }}>
        {capabilities.seek && duration > 0 ? <input className="lumio-timeline" type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)} aria-label="Posição da reprodução" aria-valuetext={`${formatTime(position)} de ${formatTime(duration)}`} onPointerDown={() => { seekingRef.current = true; setSeeking(true); }} onChange={(event) => setPosition(Number(event.target.value))} onPointerUp={(event) => { seekingRef.current = false; setSeeking(false); issue("seek", Number(event.currentTarget.value)); }} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) issue("seek", Number(event.currentTarget.value)); }} /> : null}
        <div className="lumio-control-row">
          {capabilities.playPause ? <button onClick={togglePlayback} aria-label={providerState === "playing" ? "Pausar" : "Reproduzir"} data-tooltip={providerState === "playing" ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}>{providerState === "playing" ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button> : null}
          <span className="lumio-time">{formatTime(position)} <i>/</i> {formatTime(duration)}</span><span className="lumio-control-spacer" />
          {capabilities.mute ? <button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} data-tooltip="Som (M)">{muted ? <VolumeX /> : <Volume2 />}</button> : null}
          {capabilities.volume ? <input className="lumio-volume" type="range" min="0" max="100" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} aria-label={`Volume ${volume}%`} /> : null}
          {capabilities.playbackRate && rates.length > 1 ? <label className="lumio-rate"><Gauge /><span className="sr-only">Velocidade</span><select value={media.playbackRate} onChange={(event) => issue("rate", position, Number(event.target.value))}>{rates.map((rate) => <option value={rate} key={rate}>{rate}×</option>)}</select></label> : null}
          <button onClick={() => onMusicViewChange(!musicView)} aria-label={musicView ? "Sair do Ambiente" : "Entrar no Ambiente"} data-tooltip={musicView ? "Visualização de vídeo" : "Visualização Ambiente"}><Sparkles /></button>
          {!fullscreen && !fallbackFullscreen ? <button onClick={() => onTheaterChange(!theater)} aria-label={theater ? "Sair do modo cinema" : "Entrar no modo cinema"} data-tooltip={theater ? "Sair do cinema" : "Modo cinema"}>{theater ? <Minimize2 /> : <Clapperboard />}</button> : null}
          {capabilities.fullscreen ? <button onClick={toggleFullscreen} aria-label={fallbackFullscreen ? "Sair da tela ampliada" : fullscreen ? "Sair da tela cheia" : "Tela cheia"} data-tooltip={fallbackFullscreen ? "Sair da tela ampliada (F)" : fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"}>{fullscreen || fallbackFullscreen ? <Minimize2 /> : <Maximize />}</button> : null}
        </div>
      </div> : null}
      {fullscreenError ? <p className="fullscreen-error" role="alert">{fullscreenError}</p> : null}
      {fallbackFullscreen ? <span className="fullscreen-fallback-note">Tela ampliada — tela cheia nativa indisponível neste navegador</span> : null}
      <span className="fullscreen-rotate-hint">Gire o celular para assistir em paisagem</span>
    </div>
  </section>;
}
