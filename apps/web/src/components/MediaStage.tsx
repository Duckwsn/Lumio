import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Clapperboard, Gauge, Maximize, Minimize2, Pause, Play, Plus, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { MediaState } from "@lumio/shared";
import { DriveProvider, MediaController, YouTubeProvider, type ProviderCapabilities, type ProviderEvent } from "../media/MediaProvider";

type PlaybackCommand = { action: "play" | "pause" | "seek" | "rate"; position: number; playbackRate?: number };
const emptyCapabilities: ProviderCapabilities = { playPause: false, seek: false, volume: false, mute: false, playbackRate: false, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
const formatTime = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${Math.floor(Math.max(0, value) % 60).toString().padStart(2, "0")}`;
const isEditableTarget = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node?.isContentEditable || node?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], button, [role="slider"]')); };

export function MediaStage({ media, roomId, onSkip, onRemove, onAddMedia, onPlaybackCommand, onEnded, apiUrl, token, theater, onTheaterChange, ambient, musicView, volume, effectiveVolume, onVolumeChange, resyncToken }: {
  media: MediaState; roomId: string; onSkip: () => void; onRemove: () => void; onAddMedia: () => void;
  onPlaybackCommand: (command: PlaybackCommand) => boolean; onEnded: () => void;
  apiUrl: string; token: string; theater: boolean; onTheaterChange: (active: boolean) => void; ambient: boolean; musicView: boolean;
  volume: number; effectiveVolume: number; onVolumeChange: (volume: number) => void; resyncToken: number;
}) {
  const stageRef = useRef<HTMLElement>(null); const iframeRef = useRef<HTMLIFrameElement>(null); const videoRef = useRef<HTMLVideoElement>(null); const controllerRef = useRef<MediaController | null>(null); const endedKeyRef = useRef(""); const hideTimer = useRef<number>(); const seekingRef = useRef(false); const orientationLockedRef = useRef(false); const mediaIdentityRef = useRef({ id: media.mediaId, revision: media.revision }); const onEndedRef = useRef(onEnded);
  const appliedVolume = useRef(effectiveVolume);
  const [providerError, setProviderError] = useState(""); const [providerState, setProviderState] = useState(media.state); const [position, setPosition] = useState(media.position); const [duration, setDuration] = useState(media.duration); const [seeking, setSeeking] = useState(false); const [muted, setMuted] = useState(false); const [capabilities, setCapabilities] = useState(emptyCapabilities); const [rates, setRates] = useState<number[]>([1]); const [controlsVisible, setControlsVisible] = useState(true); const [fullscreen, setFullscreen] = useState(false); const [fallbackFullscreen, setFallbackFullscreen] = useState(false); const [fullscreenError, setFullscreenError] = useState("");
  const empty = media.provider === "demo" || !media.mediaId;
  const autoplayBlocked = /NotAllowedError|play\(\) failed|autoplay|user gesture|user interaction/i.test(providerError);
  const showLoading = providerState === "loading" && !capabilities.playPause;
  const showBuffering = providerState === "buffering" && media.state === "playing";

  mediaIdentityRef.current = { id: media.mediaId, revision: media.revision }; onEndedRef.current = onEnded;
  const onProviderEvent = useCallback((event: ProviderEvent) => {
    if (event.type === "error") setProviderError(event.message);
    else if (event.type === "duration") setDuration(event.duration);
    else { setProviderState(event.type); if (event.type === "ended") { const identity = mediaIdentityRef.current; const key = `${identity.id}:${identity.revision}`; if (endedKeyRef.current !== key) { endedKeyRef.current = key; onEndedRef.current(); } } }
  }, []);

  useEffect(() => {
    controllerRef.current?.destroy(); controllerRef.current = null; setProviderError(""); setCapabilities(emptyCapabilities);
    if (empty) return;
    const controller = new MediaController({ youtube: () => new YouTubeProvider(iframeRef.current!, onProviderEvent), "google-drive": () => new DriveProvider(videoRef.current!, apiUrl, token, roomId, onProviderEvent) }, setProviderError);
    controllerRef.current = controller; return () => controller.destroy();
  }, [apiUrl, empty, media.provider, onProviderEvent, roomId, token]);

  useEffect(() => {
    if (empty) return;
    const controller = controllerRef.current;
    void controller?.sync(media, { force: resyncToken > 0 }).then(() => { if (controller !== controllerRef.current) return; controller.setVolume(appliedVolume.current); setCapabilities(controller.getCapabilities()); setRates(controller.getAvailablePlaybackRates?.() ?? [1]); });
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

  const issue = useCallback((action: PlaybackCommand["action"], nextPosition = controllerRef.current?.getCurrentTime() ?? position, playbackRate?: number) => { if (!onPlaybackCommand({ action, position: Math.max(0, nextPosition), playbackRate })) return; const controller = controllerRef.current; if (action === "play") void controller?.play(); else if (action === "pause") void controller?.pause(); else if (action === "seek") void controller?.seek(nextPosition); else if (playbackRate) controller?.setPlaybackRate(playbackRate); }, [onPlaybackCommand, position]);
  const togglePlayback = useCallback(() => issue(providerState === "playing" ? "pause" : "play"), [issue, providerState]);
  const toggleFullscreen = useCallback(() => {
    setFullscreenError("");
    if (fallbackFullscreen) { setFallbackFullscreen(false); return; }
    if (document.fullscreenElement === stageRef.current) { void document.exitFullscreen().catch(() => setFullscreenError("Não foi possível sair da tela cheia.")); return; }
    const target = stageRef.current;
    if (!target) return;
    if (typeof target.requestFullscreen !== "function" || !document.fullscreenEnabled) { setFallbackFullscreen(true); setControlsVisible(true); return; }
    setControlsVisible(true);
    void target.requestFullscreen().then(async () => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
      if (window.matchMedia("(pointer: coarse) and (max-width: 900px)").matches && typeof orientation?.lock === "function") {
        try {
          await orientation.lock("landscape");
          if (document.fullscreenElement === target) orientationLockedRef.current = true;
          else screen.orientation.unlock();
        } catch { /* Some mobile browsers do not allow orientation lock; the user can rotate manually. */ }
      }
    }).catch(() => setFullscreenError("O navegador não permitiu a tela cheia. Tente novamente pelo botão do player."));
  }, [fallbackFullscreen]);
  useEffect(() => {
    const changed = () => { const active = document.fullscreenElement === stageRef.current; setFullscreen(active); setControlsVisible(true); if (!active && orientationLockedRef.current) { screen.orientation.unlock(); orientationLockedRef.current = false; } };
    const failed = () => setFullscreenError("O navegador não permitiu a tela cheia.");
    document.addEventListener("fullscreenchange", changed); stageRef.current?.addEventListener("fullscreenerror", failed);
    const target = stageRef.current;
    return () => { document.removeEventListener("fullscreenchange", changed); target?.removeEventListener("fullscreenerror", failed); };
  }, []);
  const revealControls = useCallback(() => {
    setControlsVisible(true); window.clearTimeout(hideTimer.current);
    if (media.state === "playing") hideTimer.current = window.setTimeout(() => {
      if (!seekingRef.current && !stageRef.current?.querySelector(".lumio-controls:focus-within")) setControlsVisible(false);
    }, 2600);
  }, [media.state]);
  useEffect(() => { if (fullscreen || fallbackFullscreen) revealControls(); }, [fullscreen, fallbackFullscreen, revealControls]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || empty) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      else if (event.key.toLowerCase() === "m") { event.preventDefault(); setMuted((value) => !value); }
      else if (event.key.toLowerCase() === "f" || (event.key === "Escape" && fallbackFullscreen)) { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === "ArrowLeft" && capabilities.seek) { event.preventDefault(); issue("seek", Math.max(0, (controllerRef.current?.getCurrentTime() ?? position) - 10)); }
      else if (event.key === "ArrowRight" && capabilities.seek) { event.preventDefault(); issue("seek", Math.min(duration, (controllerRef.current?.getCurrentTime() ?? position) + 10)); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [capabilities.seek, duration, empty, fallbackFullscreen, issue, position, toggleFullscreen, togglePlayback]);

  const ambientThumbnail = media.thumbnail ?? (media.provider === "youtube" && media.mediaId ? `https://i.ytimg.com/vi/${media.mediaId}/hqdefault.jpg` : undefined);
  const visualStyle = ambient && ambientThumbnail ? { "--ambient-image": `url("${ambientThumbnail.split('"').join('%22')}")` } as CSSProperties : undefined;
  return <section ref={stageRef} className={`universal-player lumio-player ${theater ? "is-theater" : ""} ${ambient || musicView ? "has-ambient" : ""} ${musicView ? "is-music-view" : ""} ${fallbackFullscreen ? "fallback-fullscreen" : ""} ${controlsVisible || media.state !== "playing" ? "controls-visible" : ""}`} style={visualStyle} aria-label="Lumio Player" onPointerMove={revealControls} onFocusCapture={revealControls} onPointerDown={(event) => { if ((fullscreen || fallbackFullscreen) && !(event.target as HTMLElement).closest(".lumio-controls, button, input, select")) { setControlsVisible((visible) => !visible); window.clearTimeout(hideTimer.current); } }}>
    <div className="ambient-glow" aria-hidden="true" /><div className="player-frame">
      {empty ? <div className="player-empty"><span className="player-empty-icon"><Clapperboard aria-hidden="true" /></span><h2>Nenhuma mídia tocando</h2><p>Adicione um vídeo ou uma música para começar a Party.</p><button className="primary-action" onClick={onAddMedia}><Plus size={18} /> Adicionar mídia</button></div> : null}
      {media.provider === "youtube" && media.mediaId ? <iframe ref={iframeRef} className="provider-player" title={media.title} src={`https://www.youtube-nocookie.com/embed/${media.mediaId}?enablejsapi=1&origin=${window.location.origin}&controls=0&disablekb=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : null}
      {media.provider === "google-drive" && media.mediaId ? <video ref={videoRef} className="provider-player" playsInline preload="metadata" poster={media.thumbnail} /> : null}
      {musicView && !empty ? <div className="music-presentation" aria-hidden="true"><div className="music-cover">{ambientThumbnail ? <img src={ambientThumbnail} alt="" /> : <Clapperboard />}</div><div><span>Ambiente musical</span><strong>{media.title}</strong><small>{String(media.metadata?.channelTitle ?? (media.provider === "youtube" ? "YouTube" : "Google Drive"))}</small></div></div> : null}
      {!empty && !providerError && (showLoading || showBuffering) ? <div className="player-buffering" role="status"><span /> {showBuffering ? "Carregando vídeo…" : "Preparando reprodução…"}</div> : null}
      {providerError ? <div className="player-error" role="alert"><strong>{autoplayBlocked ? "O navegador pausou a reprodução automática" : "Não foi possível reproduzir esta mídia"}</strong><p>{autoplayBlocked ? "Clique abaixo para iniciar neste navegador." : providerError}</p><div>{autoplayBlocked ? <button onClick={() => void Promise.resolve(controllerRef.current?.play()).then(() => setProviderError(""), () => setProviderError("Clique em reproduzir para iniciar a mídia."))}><Play size={17} /> Clique para iniciar reprodução</button> : <button onClick={() => { setProviderError(""); void controllerRef.current?.sync(media, { force: true }); }}><RotateCcw size={17} /> Tentar novamente</button>}<button onClick={onSkip}><SkipForward size={17} /> Pular</button><button className="danger-action" onClick={onRemove}>Remover</button></div></div> : null}
      {!empty ? <div className="lumio-controls" aria-label="Controles do Lumio Player" onPointerDown={() => window.clearTimeout(hideTimer.current)} onPointerUp={(event) => { if ((event.target as HTMLElement).matches("button")) (event.target as HTMLElement).blur(); revealControls(); }}>
        {capabilities.seek ? <input className="lumio-timeline" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(position, Math.max(1, duration))} aria-label={`Posição: ${formatTime(position)} de ${formatTime(duration)}`} onPointerDown={() => { seekingRef.current = true; setSeeking(true); }} onChange={(event) => setPosition(Number(event.target.value))} onPointerUp={() => { seekingRef.current = false; setSeeking(false); issue("seek", position); }} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) issue("seek", position); }} /> : null}
        <div className="lumio-control-row">
          {capabilities.playPause ? <button onClick={togglePlayback} aria-label={providerState === "playing" ? "Pausar" : "Reproduzir"} data-tooltip={providerState === "playing" ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}>{providerState === "playing" ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button> : null}
          <span className="lumio-time">{formatTime(position)} <i>/</i> {formatTime(duration)}</span><span className="lumio-control-spacer" />
          {capabilities.mute ? <button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} data-tooltip="Som (M)">{muted ? <VolumeX /> : <Volume2 />}</button> : null}
          {capabilities.volume ? <input className="lumio-volume" type="range" min="0" max="100" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} aria-label={`Volume ${volume}%`} /> : null}
          {capabilities.playbackRate && rates.length > 1 ? <label className="lumio-rate"><Gauge /><span className="sr-only">Velocidade</span><select value={media.playbackRate} onChange={(event) => issue("rate", position, Number(event.target.value))}>{rates.map((rate) => <option value={rate} key={rate}>{rate}×</option>)}</select></label> : null}
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
