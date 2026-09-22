import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Clapperboard, Gauge, Maximize, Minimize2, Pause, Play, Plus, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { MediaState } from "@lumio/shared";
import { DriveProvider, MediaController, YouTubeProvider, type ProviderCapabilities, type ProviderEvent } from "../media/MediaProvider";

type PlaybackCommand = { action: "play" | "pause" | "seek" | "rate"; position: number; playbackRate?: number };
const emptyCapabilities: ProviderCapabilities = { playPause: false, seek: false, volume: false, mute: false, playbackRate: false, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
const formatTime = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${Math.floor(Math.max(0, value) % 60).toString().padStart(2, "0")}`;
const isEditableTarget = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], button, [role="slider"]')); };

export function MediaStage({ media, onSkip, onRemove, onAddMedia, onPlaybackCommand, onEnded, apiUrl, token, theater, onTheaterChange, ambient, musicView, volume, effectiveVolume, onVolumeChange, resyncToken }: {
  media: MediaState; onSkip: () => void; onRemove: () => void; onAddMedia: () => void;
  onPlaybackCommand: (command: PlaybackCommand) => void; onEnded: () => void;
  apiUrl: string; token: string; theater: boolean; onTheaterChange: (active: boolean) => void; ambient: boolean; musicView: boolean;
  volume: number; effectiveVolume: number; onVolumeChange: (volume: number) => void; resyncToken: number;
}) {
  const stageRef = useRef<HTMLElement>(null); const iframeRef = useRef<HTMLIFrameElement>(null); const videoRef = useRef<HTMLVideoElement>(null); const controllerRef = useRef<MediaController | null>(null); const endedKeyRef = useRef(""); const hideTimer = useRef<number>(); const seekingRef = useRef(false); const mediaIdentityRef = useRef({ id: media.mediaId, revision: media.revision }); const onEndedRef = useRef(onEnded);
  const [providerError, setProviderError] = useState(""); const [providerState, setProviderState] = useState(media.state); const [position, setPosition] = useState(media.position); const [duration, setDuration] = useState(media.duration); const [seeking, setSeeking] = useState(false); const [muted, setMuted] = useState(false); const [capabilities, setCapabilities] = useState(emptyCapabilities); const [rates, setRates] = useState<number[]>([1]); const [controlsVisible, setControlsVisible] = useState(true);
  const empty = media.provider === "demo" || !media.mediaId;

  mediaIdentityRef.current = { id: media.mediaId, revision: media.revision }; onEndedRef.current = onEnded;
  const onProviderEvent = useCallback((event: ProviderEvent) => {
    if (event.type === "error") setProviderError(event.message);
    else if (event.type === "duration") setDuration(event.duration);
    else { setProviderState(event.type); if (event.type === "ended") { const identity = mediaIdentityRef.current; const key = `${identity.id}:${identity.revision}`; if (endedKeyRef.current !== key) { endedKeyRef.current = key; onEndedRef.current(); } } }
  }, []);

  useEffect(() => {
    controllerRef.current?.destroy(); controllerRef.current = null; setProviderError(""); setCapabilities(emptyCapabilities);
    if (empty) return;
    const controller = new MediaController({ youtube: () => new YouTubeProvider(iframeRef.current!, onProviderEvent), "google-drive": () => new DriveProvider(videoRef.current!, apiUrl, token, onProviderEvent) }, setProviderError);
    controllerRef.current = controller; return () => controller.destroy();
  }, [apiUrl, empty, media.provider, onProviderEvent, token]);

  useEffect(() => {
    if (empty) return;
    void controllerRef.current?.sync(media, { force: resyncToken > 0 }).then(() => { const controller = controllerRef.current; if (!controller) return; setCapabilities(controller.getCapabilities()); setRates(controller.getAvailablePlaybackRates?.() ?? [1]); });
    if (!seekingRef.current) setPosition(media.position); setDuration(media.duration); setProviderState(media.state);
  }, [empty, media, resyncToken]);
  useEffect(() => { controllerRef.current?.setVolume(effectiveVolume); controllerRef.current?.setMuted(muted); }, [effectiveVolume, muted, media.provider]);
  useEffect(() => { if (empty || seeking || providerState !== "playing") return; const timer = window.setInterval(() => { const value = controllerRef.current?.getCurrentTime() ?? 0; if (value >= 0) setPosition(value); }, 500); return () => window.clearInterval(timer); }, [empty, providerState, seeking]);

  const issue = useCallback((action: PlaybackCommand["action"], nextPosition = controllerRef.current?.getCurrentTime() ?? position, playbackRate?: number) => { const controller = controllerRef.current; if (action === "play") void controller?.play(); else if (action === "pause") void controller?.pause(); else if (action === "seek") void controller?.seek(nextPosition); else if (playbackRate) controller?.setPlaybackRate(playbackRate); onPlaybackCommand({ action, position: Math.max(0, nextPosition), playbackRate }); }, [onPlaybackCommand, position]);
  const togglePlayback = useCallback(() => issue(providerState === "playing" ? "pause" : "play"), [issue, providerState]);
  const toggleFullscreen = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen(); }, []);
  const revealControls = useCallback(() => { setControlsVisible(true); window.clearTimeout(hideTimer.current); if (media.state === "playing") hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600); }, [media.state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || empty) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      else if (event.key.toLowerCase() === "m") { event.preventDefault(); setMuted((value) => !value); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === "ArrowLeft" && capabilities.seek) { event.preventDefault(); issue("seek", Math.max(0, (controllerRef.current?.getCurrentTime() ?? position) - 10)); }
      else if (event.key === "ArrowRight" && capabilities.seek) { event.preventDefault(); issue("seek", Math.min(duration, (controllerRef.current?.getCurrentTime() ?? position) + 10)); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [capabilities.seek, duration, empty, issue, position, toggleFullscreen, togglePlayback]);

  const ambientThumbnail = media.thumbnail ?? (media.provider === "youtube" && media.mediaId ? `https://i.ytimg.com/vi/${media.mediaId}/hqdefault.jpg` : undefined);
  const visualStyle = ambient && ambientThumbnail ? { "--ambient-image": `url("${ambientThumbnail.split('"').join('%22')}")` } as CSSProperties : undefined;
  return <section ref={stageRef} className={`universal-player lumio-player ${theater ? "is-theater" : ""} ${ambient || musicView ? "has-ambient" : ""} ${musicView ? "is-music-view" : ""} ${controlsVisible || media.state !== "playing" ? "controls-visible" : ""}`} style={visualStyle} aria-label="Lumio Player" onPointerMove={revealControls} onFocusCapture={revealControls}>
    <div className="ambient-glow" aria-hidden="true" /><div className="player-frame">
      {empty ? <div className="player-empty"><span className="player-empty-icon"><Clapperboard aria-hidden="true" /></span><h2>Nenhuma mídia tocando</h2><p>Adicione um vídeo ou uma música para começar a Party.</p><button className="primary-action" onClick={onAddMedia}><Plus size={18} /> Adicionar mídia</button></div> : null}
      {media.provider === "youtube" && media.mediaId ? <iframe ref={iframeRef} className="provider-player" title={media.title} src={`https://www.youtube-nocookie.com/embed/${media.mediaId}?enablejsapi=1&origin=${window.location.origin}&controls=0&disablekb=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : null}
      {media.provider === "google-drive" && media.mediaId ? <video ref={videoRef} className="provider-player" playsInline preload="metadata" poster={media.thumbnail} /> : null}
      {musicView && !empty ? <div className="music-presentation" aria-hidden="true"><div className="music-cover">{ambientThumbnail ? <img src={ambientThumbnail} alt="" /> : <Clapperboard />}</div><div><span>Ambiente musical</span><strong>{media.title}</strong><small>{String(media.metadata?.channelTitle ?? (media.provider === "youtube" ? "YouTube" : "Google Drive"))}</small></div></div> : null}
      {!empty && (providerState === "loading" || providerState === "buffering") ? <div className="player-buffering"><span /> Preparando reprodução…</div> : null}
      {providerError ? <div className="player-error" role="alert"><strong>Não foi possível reproduzir esta mídia</strong><p>{providerError}</p><div><button onClick={() => void controllerRef.current?.sync(media, { force: true })}><RotateCcw size={17} /> Tentar novamente</button><button onClick={onSkip}><SkipForward size={17} /> Pular</button><button className="danger-action" onClick={onRemove}>Remover</button></div></div> : null}
      {!empty ? <div className="lumio-controls" aria-label="Controles do Lumio Player">
        {capabilities.seek ? <input className="lumio-timeline" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(position, Math.max(1, duration))} aria-label={`Posição: ${formatTime(position)} de ${formatTime(duration)}`} onPointerDown={() => { seekingRef.current = true; setSeeking(true); }} onChange={(event) => setPosition(Number(event.target.value))} onPointerUp={() => { seekingRef.current = false; setSeeking(false); issue("seek", position); }} onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) issue("seek", position); }} /> : null}
        <div className="lumio-control-row">
          {capabilities.playPause ? <button onClick={togglePlayback} aria-label={providerState === "playing" ? "Pausar" : "Reproduzir"} data-tooltip={providerState === "playing" ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}>{providerState === "playing" ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button> : null}
          <span className="lumio-time">{formatTime(position)} <i>/</i> {formatTime(duration)}</span><span className="lumio-control-spacer" />
          {capabilities.mute ? <button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Ativar som" : "Silenciar"} data-tooltip="Som (M)">{muted ? <VolumeX /> : <Volume2 />}</button> : null}
          {capabilities.volume ? <input className="lumio-volume" type="range" min="0" max="100" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} aria-label={`Volume ${volume}%`} /> : null}
          {capabilities.playbackRate && rates.length > 1 ? <label className="lumio-rate"><Gauge /><span className="sr-only">Velocidade</span><select value={media.playbackRate} onChange={(event) => issue("rate", position, Number(event.target.value))}>{rates.map((rate) => <option value={rate} key={rate}>{rate}×</option>)}</select></label> : null}
          <button onClick={() => onTheaterChange(!theater)} aria-label={theater ? "Sair do modo cinema" : "Entrar no modo cinema"} data-tooltip={theater ? "Sair do cinema" : "Modo cinema"}>{theater ? <Minimize2 /> : <Clapperboard />}</button>
          {capabilities.fullscreen ? <button onClick={toggleFullscreen} aria-label="Tela cheia" data-tooltip="Tela cheia (F)"><Maximize /></button> : null}
        </div>
      </div> : null}
    </div>
  </section>;
}
