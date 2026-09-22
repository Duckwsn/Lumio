import type { MediaProvider as MediaProviderId, MediaState, PlaybackState } from "@lumio/shared";

export interface ProviderCapabilities {
  playPause: boolean; seek: boolean; volume: boolean; mute: boolean; playbackRate: boolean;
  captions: boolean; qualitySelection: boolean; fullscreen: boolean; pictureInPicture: boolean;
}

export type ProviderEvent =
  | { type: "ready" | "playing" | "paused" | "buffering" | "ended" }
  | { type: "duration"; duration: number }
  | { type: "error"; code: "MEDIA_UNAVAILABLE" | "NETWORK_ERROR" | "PROVIDER_ERROR"; message: string };

interface YouTubePlayerInstance {
  cueVideoById(input: { videoId: string; startSeconds?: number }): void; playVideo(): void; pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void; getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(volume: number): void; getVolume(): number; mute(): void; unMute(): void; isMuted(): boolean;
  setPlaybackRate(rate: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[]; destroy(): void;
}
interface YouTubeNamespace { Player: new (elementId: string, options: { events: { onReady: () => void; onStateChange: (event: { data: number }) => void; onError: () => void } }) => YouTubePlayerInstance; }
declare global { interface Window { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void; } }

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;
const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); if (window.YT) resolve(window.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) { const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.async = true; document.head.append(script); }
  });
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

export const expectedPosition = (media: MediaState, now = Date.now()) => media.state === "playing" && media.startedAt !== null
  ? Math.min(media.duration, media.position + Math.max(0, now - media.startedAt) / 1000 * media.playbackRate)
  : media.position;

const youtubeCapabilities: ProviderCapabilities = { playPause: true, seek: true, volume: true, mute: true, playbackRate: true, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };
const unavailableCapabilities: ProviderCapabilities = { playPause: false, seek: false, volume: false, mute: false, playbackRate: false, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: false };

export class YouTubeProvider implements MediaProviderAdapter {
  readonly id = "youtube" as const;
  private player: YouTubePlayerInstance | null = null; private readonly ready: Promise<void>; private lastMediaId = ""; private state: PlaybackState = "loading"; private destroyed = false;
  constructor(private readonly iframe: HTMLIFrameElement, private readonly onEvent: (event: ProviderEvent) => void) {
    iframe.id ||= `lumio-youtube-${crypto.randomUUID()}`;
    this.ready = loadYouTubeApi().then((YT) => new Promise<void>((resolve) => {
      const player = new YT.Player(iframe.id, { events: {
        onReady: () => { if (this.destroyed) { player.destroy(); return; } this.player = player; this.state = "ready"; this.onEvent({ type: "ready" }); resolve(); },
        onStateChange: ({ data }) => this.handleStateChange(data),
        onError: () => { this.state = "error"; this.onEvent({ type: "error", code: "MEDIA_UNAVAILABLE", message: "Este vídeo não pode ser reproduzido pelo YouTube." }); },
      } });
    }));
  }
  private handleStateChange(value: number) {
    const type = value === 1 ? "playing" : value === 2 ? "paused" : value === 3 ? "buffering" : value === 0 ? "ended" : null;
    if (!type) return; this.state = type; this.onEvent({ type }); const duration = this.getDuration(); if (duration > 0) this.onEvent({ type: "duration", duration });
  }
  async load(media: MediaState) { await this.ready; if (!this.player || this.lastMediaId === media.mediaId) return; this.lastMediaId = media.mediaId; this.state = "loading"; this.player.cueVideoById({ videoId: media.mediaId, startSeconds: expectedPosition(media) }); }
  play() { this.player?.playVideo(); } pause() { this.player?.pauseVideo(); } seek(seconds: number) { this.player?.seekTo(Math.max(0, seconds), true); }
  getCurrentTime() { return this.player?.getCurrentTime() ?? 0; } getDuration() { return this.player?.getDuration() ?? 0; } getState() { return this.state; }
  setVolume(volume: number) { this.player?.setVolume(Math.max(0, Math.min(100, volume))); } getVolume() { return this.player?.getVolume() ?? 100; }
  setMuted(muted: boolean) { if (muted) this.player?.mute(); else this.player?.unMute(); } isMuted() { return this.player?.isMuted() ?? false; }
  setPlaybackRate(rate: number) { this.player?.setPlaybackRate(rate); } getPlaybackRate() { return this.player?.getPlaybackRate() ?? 1; } getAvailablePlaybackRates() { return this.player?.getAvailablePlaybackRates() ?? [1]; }
  getCapabilities() { return youtubeCapabilities; }
  async sync(media: MediaState, options?: { force?: boolean }) {
    const changed = this.lastMediaId !== media.mediaId; await this.load(media);
    const target = expectedPosition(media); const drift = target - this.getCurrentTime();
    if (changed || Math.abs(drift) > (options?.force ? 1.25 : 2.5)) await this.seek(target);
    if (media.playbackRate !== this.getPlaybackRate()) this.setPlaybackRate(media.playbackRate);
    if (media.state === "playing" && this.player?.getPlayerState() !== 1) await this.play();
    if (["paused", "ended"].includes(media.state) && this.player?.getPlayerState() === 1) await this.pause();
  }
  destroy() { this.destroyed = true; this.player?.destroy(); this.player = null; this.state = "idle"; }
}

// Adapter kept generic for the pre-existing technical Drive path. The complete Drive product remains Stage 9 scope.
export class DriveProvider implements MediaProviderAdapter {
  readonly id = "google-drive" as const; private state: PlaybackState = "idle"; private lastMediaId = ""; private loadGeneration = 0;
  private readonly capabilities: ProviderCapabilities = { playPause: true, seek: true, volume: true, mute: true, playbackRate: true, captions: false, qualitySelection: false, fullscreen: true, pictureInPicture: true };
  constructor(private readonly video: HTMLVideoElement, private readonly apiUrl: string, private readonly token: string, private readonly onEvent: (event: ProviderEvent) => void) { video.addEventListener("playing", this.onPlaying); video.addEventListener("pause", this.onPause); video.addEventListener("waiting", this.onWaiting); video.addEventListener("ended", this.onEnded); video.addEventListener("durationchange", this.onDuration); video.addEventListener("error", this.onError); }
  private onPlaying = () => { this.state = "playing"; this.onEvent({ type: "playing" }); }; private onPause = () => { if (!this.video.ended) { this.state = "paused"; this.onEvent({ type: "paused" }); } }; private onWaiting = () => { this.state = "buffering"; this.onEvent({ type: "buffering" }); }; private onEnded = () => { this.state = "ended"; this.onEvent({ type: "ended" }); }; private onDuration = () => { if (Number.isFinite(this.video.duration)) this.onEvent({ type: "duration", duration: this.video.duration }); }; private onError = () => { this.state = "error"; this.onEvent({ type: "error", code: "PROVIDER_ERROR", message: "Não foi possível reproduzir este arquivo." }); };
  async load(media: MediaState) { if (this.lastMediaId === media.mediaId && this.video.src) return; const generation = ++this.loadGeneration; this.state = "loading"; this.lastMediaId = media.mediaId; const response = await fetch(`${this.apiUrl}/api/google-drive/files/${encodeURIComponent(media.mediaId)}/playback`, { method: "POST", headers: { Authorization: `Bearer ${this.token}` } }); const data = await response.json() as { url?: string; message?: string }; if (!response.ok || !data.url) throw new Error(data.message ?? "Google Drive será concluído na Etapa 9."); if (generation !== this.loadGeneration) return; this.video.src = data.url; this.video.load(); }
  async play() { await this.video.play(); } pause() { this.video.pause(); } seek(seconds: number) { if (Number.isFinite(seconds)) this.video.currentTime = Math.max(0, seconds); }
  getCurrentTime() { return Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0; } getDuration() { return Number.isFinite(this.video.duration) ? this.video.duration : 0; } getState() { return this.state; }
  setVolume(volume: number) { this.video.volume = Math.max(0, Math.min(1, volume / 100)); } getVolume() { return this.video.volume * 100; } setMuted(muted: boolean) { this.video.muted = muted; } isMuted() { return this.video.muted; }
  setPlaybackRate(rate: number) { this.video.playbackRate = rate; } getPlaybackRate() { return this.video.playbackRate; } getAvailablePlaybackRates() { return [.5, .75, 1, 1.25, 1.5, 2]; } getCapabilities() { return this.capabilities; }
  async sync(media: MediaState, options?: { force?: boolean }) { const changed = this.lastMediaId !== media.mediaId; await this.load(media); const target = expectedPosition(media); if (changed || Math.abs(target - this.getCurrentTime()) > (options?.force ? 1.25 : 2.5)) this.seek(target); if (this.video.playbackRate !== media.playbackRate) this.setPlaybackRate(media.playbackRate); if (media.state === "playing" && this.video.paused) await this.play(); if (["paused", "ended"].includes(media.state) && !this.video.paused) this.pause(); }
  async requestPictureInPicture() { if (document.pictureInPictureEnabled && this.video.requestPictureInPicture) await this.video.requestPictureInPicture(); }
  destroy() { this.loadGeneration += 1; this.video.removeEventListener("playing", this.onPlaying); this.video.removeEventListener("pause", this.onPause); this.video.removeEventListener("waiting", this.onWaiting); this.video.removeEventListener("ended", this.onEnded); this.video.removeEventListener("durationchange", this.onDuration); this.video.removeEventListener("error", this.onError); this.video.pause(); this.video.removeAttribute("src"); this.video.load(); this.state = "idle"; }
}

export class MediaController {
  private active: MediaProviderAdapter | null = null; private generation = 0; private lastRevision = -1;
  constructor(private readonly factories: Partial<Record<MediaProviderId, () => MediaProviderAdapter>>, private readonly onError: (message: string) => void) {}
  async sync(media: MediaState, options?: { force?: boolean }) {
    if (!options?.force && media.revision < this.lastRevision) return;
    const generation = ++this.generation;
    if (!this.active || this.active.id !== media.provider) { this.active?.destroy(); const factory = this.factories[media.provider]; if (!factory) return this.onError("Provider de mídia indisponível."); this.active = factory(); this.lastRevision = -1; }
    try { await this.active.sync(media, options); if (generation === this.generation) { this.lastRevision = Math.max(this.lastRevision, media.revision); this.onError(""); } }
    catch (error) { if (generation === this.generation) this.onError(error instanceof Error ? error.message : "Não foi possível reproduzir esta mídia."); }
  }
  getCapabilities() { return this.active?.getCapabilities() ?? unavailableCapabilities; } getCurrentTime() { return this.active?.getCurrentTime() ?? 0; } getDuration() { return this.active?.getDuration() ?? 0; } getState() { return this.active?.getState() ?? "idle"; }
  getAvailablePlaybackRates() { return this.active?.getAvailablePlaybackRates() ?? [1]; }
  play() { return this.active?.play(); } pause() { return this.active?.pause(); } seek(seconds: number) { return this.active?.seek(seconds); } setPlaybackRate(rate: number) { this.active?.setPlaybackRate(rate); }
  setVolume(volume: number) { this.active?.setVolume(volume); } setMuted(muted: boolean) { this.active?.setMuted(muted); } destroy() { this.generation += 1; this.active?.destroy(); this.active = null; }
}
