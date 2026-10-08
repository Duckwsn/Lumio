import type { MediaProvider as MediaProviderId, MediaState, PlaybackState } from "@lumio/shared";

export interface ProviderCapabilities {
  playPause: boolean; seek: boolean; volume: boolean; mute: boolean; playbackRate: boolean;
  captions: boolean; qualitySelection: boolean; fullscreen: boolean; pictureInPicture: boolean;
}

export type ProviderEvent =
  | { type: "ready" | "playing" | "paused" | "buffering" | "ended" | "autoplay-blocked" }
  | { type: "duration"; duration: number }
  | { type: "error"; code: "MEDIA_UNAVAILABLE" | "NETWORK_ERROR" | "PROVIDER_ERROR" | "EMBED_RESTRICTED" | "UNSUPPORTED_FORMAT"; message: string };

interface YouTubePlayerInstance {
  cueVideoById(input: { videoId: string; startSeconds?: number }): void; playVideo(): void; pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void; getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(volume: number): void; getVolume(): number; mute(): void; unMute(): void; isMuted(): boolean;
  setPlaybackRate(rate: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[]; destroy(): void;
  getVideoUrl?(): string;
}
interface YouTubeNamespace { Player: new (elementId: string, options: { events: { onReady: () => void; onStateChange: (event: { data: number }) => void; onError: (event: { data: number }) => void; onAutoplayBlocked: () => void } }) => YouTubePlayerInstance; }
declare global { interface Window { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void; } }

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;
const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]') ?? document.createElement("script");
    const inserted = !script.isConnected;
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error("Não foi possível carregar o player do YouTube. Tente novamente."));
    };
    const ready = () => {
      cleanup();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("O player do YouTube não está disponível. Tente novamente."));
      previous?.();
    };
    const timeout = window.setTimeout(failed, 15_000);
    script.addEventListener("error", failed, { once: true });
    window.onYouTubeIframeAPIReady = ready;
    if (inserted) { script.src = "https://www.youtube.com/iframe_api"; script.async = true; document.head.append(script); }
  }).catch((error: unknown) => { youtubeApiPromise = null; throw error; });
  return youtubeApiPromise;
};

export interface MediaProviderAdapter {
  readonly id: MediaProviderId;
  load(media: MediaState): Promise<void> | void; play(): Promise<void> | void; pause(): Promise<void> | void; seek(seconds: number): Promise<void> | void;
  getCurrentTime(): number; getDuration(): number; getState(): PlaybackState;
  setVolume(volume: number): void; getVolume(): number; setMuted(muted: boolean): void; isMuted(): boolean;
  setPlaybackRate(rate: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[]; getCapabilities(): ProviderCapabilities;
  sync(media: MediaState, options?: { force?: boolean }): Promise<void> | void; requestPictureInPicture?(): Promise<void>; destroy(): void;
}

export const expectedPosition = (media: MediaState, now = Date.now()) => {
  const position = media.state === "playing" && media.startedAt !== null
    ? media.position + Math.max(0, now - media.startedAt) / 1000 * media.playbackRate
    : media.position;
  return media.duration > 0 ? Math.min(media.duration, position) : position;
};

export const shouldApplyMedia = (incoming: MediaState, current: MediaState) =>
  incoming.revision > current.revision ||
  incoming.revision === current.revision && incoming.mediaId === current.mediaId &&
  (incoming.state !== "playing" || incoming.position >= current.position);

const youtubeCapabilities: ProviderCapabilities = { playPause: true, seek: true, volume: true, mute: true, playbackRate: true, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
const unavailableCapabilities: ProviderCapabilities = { playPause: false, seek: false, volume: false, mute: false, playbackRate: false, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
export const youtubePlaybackError = (code: number): Extract<ProviderEvent, { type: "error" }> => {
  if (code === 101 || code === 150) return { type: "error", code: "EMBED_RESTRICTED", message: "O proprietário não permite reproduzir este vídeo fora do YouTube." };
  if (code === 100) return { type: "error", code: "MEDIA_UNAVAILABLE", message: "Este vídeo foi removido, é privado ou não está disponível." };
  if (code === 153) return { type: "error", code: "PROVIDER_ERROR", message: "O YouTube não reconheceu a origem deste player. Verifique a configuração do site." };
  if (code === 5) return { type: "error", code: "UNSUPPORTED_FORMAT", message: "O YouTube não conseguiu reproduzir este vídeo neste navegador." };
  return { type: "error", code: "MEDIA_UNAVAILABLE", message: "Este vídeo não pôde ser reproduzido pelo YouTube." };
};

export class YouTubeProvider implements MediaProviderAdapter {
  readonly id = "youtube" as const;
  private player: YouTubePlayerInstance | null = null; private readonly ready: Promise<void>; private lastMediaId = ""; private state: PlaybackState = "loading"; private destroyed = false;
  private syncGeneration = 0;
  private latestMedia: MediaState | null = null;
  constructor(private readonly iframe: HTMLIFrameElement, private readonly onEvent: (event: ProviderEvent) => void) {
    iframe.id ||= `lumio-youtube-${crypto.randomUUID()}`;
    this.ready = loadYouTubeApi().then((YT) => new Promise<void>((resolve) => {
      if (this.destroyed) { resolve(); return; }
      const player = new YT.Player(iframe.id, { events: {
        onReady: () => { if (this.destroyed) { player.destroy(); resolve(); return; } this.player = player; this.state = "ready"; this.onEvent({ type: "ready" }); resolve(); },
        onStateChange: ({ data }) => this.handleStateChange(data),
        onError: ({ data }) => { if (this.destroyed) return; this.state = "error"; this.onEvent(youtubePlaybackError(data)); },
        onAutoplayBlocked: () => { if (!this.destroyed && this.latestMedia?.state === "playing") this.onEvent({ type: "autoplay-blocked" }); },
      } });
    }));
  }
  private handleStateChange(value: number) {
    if (this.destroyed) return;
    // The official API may deliver an event from the prior cue after a rapid
    // switch. Never interpret its ended state as the new queue item ending.
    if (value === 0 && this.player?.getVideoUrl) {
      const url = this.player.getVideoUrl();
      try { if (new URL(url).searchParams.get("v") !== this.lastMediaId) return; }
      catch { return; }
    }
    if (value === 5 && this.latestMedia?.mediaId === this.lastMediaId) { this.apply(this.latestMedia, true); return; }
    const type = value === 1 ? "playing" : value === 2 ? "paused" : value === 3 ? "buffering" : value === 0 ? "ended" : null;
    if (!type) return; this.state = type; this.onEvent({ type }); const duration = this.getDuration(); if (duration > 0) this.onEvent({ type: "duration", duration });
  }
  async load(media: MediaState) { await this.ready; if (this.destroyed || !this.player || this.lastMediaId === media.mediaId) return; this.lastMediaId = media.mediaId; this.state = "loading"; this.player.cueVideoById({ videoId: media.mediaId, startSeconds: expectedPosition(media) }); }
  canRetryInPlace() { return Boolean(this.player && !this.destroyed); }
  prepareRetry() { this.lastMediaId = ""; }
  play() { this.player?.playVideo(); } pause() { this.player?.pauseVideo(); } seek(seconds: number) { this.player?.seekTo(Math.max(0, seconds), true); }
  getCurrentTime() { return this.player?.getCurrentTime() ?? 0; } getDuration() { return this.player?.getDuration() ?? 0; } getState() { return this.state; }
  setVolume(volume: number) { this.player?.setVolume(Math.max(0, Math.min(100, volume))); } getVolume() { return this.player?.getVolume() ?? 100; }
  setMuted(muted: boolean) { if (muted) this.player?.mute(); else this.player?.unMute(); } isMuted() { return this.player?.isMuted() ?? false; }
  setPlaybackRate(rate: number) { this.player?.setPlaybackRate(rate); } getPlaybackRate() { return this.player?.getPlaybackRate() ?? 1; } getAvailablePlaybackRates() { return this.player?.getAvailablePlaybackRates() ?? [1]; }
  getCapabilities() { return youtubeCapabilities; }
  async sync(media: MediaState, options?: { force?: boolean }) {
    const generation = ++this.syncGeneration; this.latestMedia = media;
    await this.ready;
    if (this.destroyed || generation !== this.syncGeneration) return;
    const changed = this.lastMediaId !== media.mediaId; await this.load(media);
    if (this.destroyed || generation !== this.syncGeneration) return;
    this.apply(media, Boolean(changed || options?.force));
  }
  private apply(media: MediaState, force: boolean) {
    const target = expectedPosition(media); const drift = target - this.getCurrentTime();
    if (Math.abs(drift) > (force ? 1.25 : 2.5)) this.seek(target);
    if (media.playbackRate !== this.getPlaybackRate()) this.setPlaybackRate(media.playbackRate);
    if (media.state === "playing" && this.player?.getPlayerState() !== 1) this.play();
    if (["paused", "ended"].includes(media.state)) this.pause();
  }
  destroy() { this.destroyed = true; this.player?.pauseVideo(); this.player?.destroy(); this.player = null; this.state = "idle"; }
}

export class DriveProvider implements MediaProviderAdapter {
  readonly id = "google-drive" as const; private state: PlaybackState = "idle"; private lastMediaId = ""; private loadGeneration = 0; private recoveryAttempted = false; private destroyed = false; private ticketRequest: AbortController | null = null; private metadataHandler: (() => void) | null = null;
  private readonly capabilities: ProviderCapabilities = { playPause: true, seek: true, volume: true, mute: true, playbackRate: true, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: true };
  private metadataReady: Promise<void> = Promise.resolve();
  private syncGeneration = 0;
  constructor(private readonly video: HTMLVideoElement, private readonly apiUrl: string, private readonly token: string, private readonly roomId: string, private readonly onEvent: (event: ProviderEvent) => void) { video.addEventListener("playing", this.onPlaying); video.addEventListener("pause", this.onPause); video.addEventListener("waiting", this.onWaiting); video.addEventListener("ended", this.onEnded); video.addEventListener("durationchange", this.onDuration); video.addEventListener("error", this.onError); }
  private onPlaying = () => { this.recoveryAttempted = false; this.state = "playing"; this.onEvent({ type: "playing" }); }; private onPause = () => { if (!this.video.ended) { this.state = "paused"; this.onEvent({ type: "paused" }); } }; private onWaiting = () => { this.state = "buffering"; this.onEvent({ type: "buffering" }); }; private onEnded = () => { this.state = "ended"; this.onEvent({ type: "ended" }); }; private onDuration = () => { if (Number.isFinite(this.video.duration)) this.onEvent({ type: "duration", duration: this.video.duration }); };
  private onError = () => {
    if (this.destroyed) return;
    if (this.video.error?.code === 4 || this.video.error?.code === 3) {
      this.state = "error";
      this.onEvent({ type: "error", code: "UNSUPPORTED_FORMAT", message: "O formato ou codec deste arquivo não é compatível com o navegador." });
      return;
    }
    if (this.recoveryAttempted || !this.lastMediaId) { this.state = "error"; this.onEvent({ type: "error", code: "PROVIDER_ERROR", message: "A mídia está indisponível ou a conexão com o Drive foi interrompida." }); return; }
    this.recoveryAttempted = true;
    const position = this.getCurrentTime(), wasPlaying = this.state === "playing" || this.state === "buffering";
    const generation = this.loadGeneration;
    this.ticketRequest?.abort(); const controller = new AbortController(); this.ticketRequest = controller;
    void this.ticket(this.lastMediaId, controller.signal).then((url) => {
      if (this.destroyed || generation !== this.loadGeneration) return;
      if (this.metadataHandler) this.video.removeEventListener("loadedmetadata", this.metadataHandler);
      this.metadataHandler = () => { this.metadataHandler = null; const media = this.latestMedia; this.seek(media ? expectedPosition(media) : position); if (media ? media.state === "playing" : wasPlaying) void this.play().catch(() => undefined); };
      this.video.addEventListener("loadedmetadata", this.metadataHandler, { once: true });
      this.video.src = url; this.video.load();
    }).catch((error) => { if (!this.destroyed && generation === this.loadGeneration && (error as Error).name !== "AbortError") { this.state = "error"; this.onEvent({ type: "error", code: "PROVIDER_ERROR", message: error instanceof Error ? error.message : "Esta mídia não está disponível." }); } });
  };
  private async ticket(mediaId: string, signal: AbortSignal) { const response = await fetch(`${this.apiUrl}/api/google-drive/files/${encodeURIComponent(mediaId)}/playback`, { method: "POST", credentials: "include", signal, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ roomId: this.roomId }) }); const data = await response.json() as { url?: string; message?: string }; if (!response.ok || !data.url?.startsWith("/api/google-drive/playback/")) throw new Error(data.message ?? "Esta mídia do Drive está indisponível."); return new URL(data.url, this.apiUrl).toString(); }
  private loadPromise: Promise<void> | null = null;
  private appliedMediaId = "";
  private latestMedia: MediaState | null = null;
  load(media: MediaState): Promise<void> {
    if (this.lastMediaId === media.mediaId && this.loadPromise) return this.loadPromise;
    const generation = ++this.loadGeneration; this.ticketRequest?.abort();
    if (this.metadataHandler) this.video.removeEventListener("loadedmetadata", this.metadataHandler);
    this.metadataHandler = null;
    const controller = new AbortController(); this.ticketRequest = controller;
    this.state = "loading"; this.lastMediaId = media.mediaId; this.recoveryAttempted = false;
    this.loadPromise = (async () => {
      if (media.mimeType && !this.video.canPlayType(media.mimeType)) throw new Error("Este formato de mídia não é compatível com seu navegador.");
      const url = await this.ticket(media.mediaId, controller.signal);
      if (this.destroyed || generation !== this.loadGeneration) return;
      this.video.src = url; this.video.load();
      this.metadataReady = this.waitForMetadata(controller.signal);
      await this.metadataReady;
      if (!this.destroyed && generation === this.loadGeneration) this.onEvent({ type: "ready" });
    })().catch((error: unknown) => { if (generation === this.loadGeneration) this.loadPromise = null; throw error; });
    return this.loadPromise;
  }
  private waitForMetadata(signal: AbortSignal) {
    if (this.video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const clean = () => { clearTimeout(timer); this.video.removeEventListener("loadedmetadata", ready); this.video.removeEventListener("error", fail); signal.removeEventListener("abort", abort); };
      const ready = () => { clean(); resolve(); };
      const fail = () => { clean(); reject(new Error("Não foi possível preparar esta mídia.")); };
      const abort = () => { clean(); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(fail, 15_000);
      this.video.addEventListener("loadedmetadata", ready, { once: true }); this.video.addEventListener("error", fail, { once: true }); signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  async play() { try { await this.video.play(); } catch (error) { if ((error as Error).name === "NotAllowedError") this.onEvent({ type: "autoplay-blocked" }); throw error; } } pause() { this.video.pause(); } seek(seconds: number) { if (Number.isFinite(seconds)) this.video.currentTime = Math.max(0, seconds); }
  getCurrentTime() { return Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0; } getDuration() { return Number.isFinite(this.video.duration) ? this.video.duration : 0; } getState() { return this.state; }
  setVolume(volume: number) { this.video.volume = Math.max(0, Math.min(1, volume / 100)); } getVolume() { return this.video.volume * 100; } setMuted(muted: boolean) { this.video.muted = muted; } isMuted() { return this.video.muted; }
  setPlaybackRate(rate: number) { this.video.playbackRate = rate; } getPlaybackRate() { return this.video.playbackRate; } getAvailablePlaybackRates() { return [.5, .75, 1, 1.25, 1.5, 2]; } getCapabilities() { return this.capabilities; }
  async sync(media: MediaState, options?: { force?: boolean }) { const generation = ++this.syncGeneration; this.latestMedia = media; const changed = this.appliedMediaId !== media.mediaId; await this.load(media); if (this.destroyed || generation !== this.syncGeneration || this.lastMediaId !== media.mediaId) return; const target = expectedPosition(media); if (changed || Math.abs(target - this.getCurrentTime()) > (options?.force ? 1.25 : 2.5)) this.seek(target); this.appliedMediaId = media.mediaId; if (this.video.playbackRate !== media.playbackRate) this.setPlaybackRate(media.playbackRate); if (media.state === "playing" && this.video.paused) await this.play(); if (["paused", "ended"].includes(media.state) && !this.video.paused) this.pause(); }
  async requestPictureInPicture() { if (document.pictureInPictureEnabled && this.video.requestPictureInPicture) await this.video.requestPictureInPicture(); }
  destroy() { this.destroyed = true; this.loadGeneration += 1; this.ticketRequest?.abort(); this.ticketRequest = null; if (this.metadataHandler) this.video.removeEventListener("loadedmetadata", this.metadataHandler); this.metadataHandler = null; this.video.removeEventListener("playing", this.onPlaying); this.video.removeEventListener("pause", this.onPause); this.video.removeEventListener("waiting", this.onWaiting); this.video.removeEventListener("ended", this.onEnded); this.video.removeEventListener("durationchange", this.onDuration); this.video.removeEventListener("error", this.onError); this.video.pause(); this.video.removeAttribute("src"); this.video.load(); this.state = "idle"; }
}

export class MediaController {
  private active: MediaProviderAdapter | null = null; private generation = 0; private lastRevision = -1;
  private latestMedia: MediaState | null = null;
  constructor(private readonly factories: Partial<Record<MediaProviderId, () => MediaProviderAdapter>>, private readonly onError: (message: string) => void) {}
  resetRevision() { this.lastRevision = -1; }
  async sync(media: MediaState, options?: { force?: boolean }) {
    if (media.revision < this.lastRevision) return;
    this.lastRevision = media.revision; this.latestMedia = media;
    const generation = ++this.generation;
    if (!this.active || this.active.id !== media.provider) { this.active?.destroy(); const factory = this.factories[media.provider]; if (!factory) return this.onError("Provider de mídia indisponível."); this.active = factory(); }
    try { await this.active.sync(media, options); if (generation === this.generation) { this.lastRevision = Math.max(this.lastRevision, media.revision); if (this.active.getState() !== "error") this.onError(""); } }
    catch (error) { if (generation === this.generation) this.onError(error instanceof Error ? error.message : "Não foi possível reproduzir esta mídia."); }
  }
  retry(media: MediaState) {
    if (this.active instanceof YouTubeProvider && this.active.canRetryInPlace()) { this.active.prepareRetry(); return this.sync(media, { force: true }); }
    this.active?.destroy(); this.active = null;
    return this.sync(media, { force: true });
  }
  getCapabilities() { return this.active?.getCapabilities() ?? unavailableCapabilities; } getCurrentTime() { return this.active?.getCurrentTime() ?? 0; } getDuration() { return this.active?.getDuration() ?? 0; } getState() { return this.active?.getState() ?? "idle"; }
  getAvailablePlaybackRates() { return this.active?.getAvailablePlaybackRates() ?? [1]; }
  resumeFromGesture() {
    const media = this.latestMedia;
    if (!this.active || !media || media.state !== "playing") return;
    this.active.seek(expectedPosition(media)); this.active.setPlaybackRate(media.playbackRate);
    return this.active.play();
  }
  play() { return this.active?.play(); } pause() { return this.active?.pause(); } seek(seconds: number) { return this.active?.seek(seconds); } setPlaybackRate(rate: number) { this.active?.setPlaybackRate(rate); }
  setVolume(volume: number) { this.active?.setVolume(volume); } setMuted(muted: boolean) { this.active?.setMuted(muted); } destroy() { this.generation += 1; this.active?.destroy(); this.active = null; }
}
