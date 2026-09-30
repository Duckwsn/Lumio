import assert from "node:assert/strict";
import test from "node:test";
import type { MediaState } from "@lumio/shared";
import { DriveProvider, YouTubeProvider, MediaController, type MediaProviderAdapter } from "./MediaProvider";
import { shouldDismissSheet } from "../components/MobileBottomSheet";

const media = (provider: "youtube" | "google-drive", revision: number): MediaState => ({ mediaId: `${provider}-${revision}`, provider, type: "video", title: "Teste", state: "paused", position: 0, duration: 60, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "test", revision });

test("secondary sheet dismissal combines distance and downward velocity", () => {
  assert.equal(shouldDismissSheet(200, 400, 0), true);
  assert.equal(shouldDismissSheet(20, 400, 0), false);
  assert.equal(shouldDismissSheet(20, 400, 0.5), true);
  assert.equal(shouldDismissSheet(0, 400, 0.5), false);
  assert.equal(shouldDismissSheet(20, 400, -0.5), false);
});

test("YouTube reconciles either readiness order, latest media and autoplay gesture locally", async () => {
  const previousWindow = globalThis.window;
  let events: { onReady: () => void; onStateChange: (event: { data: number }) => void; onAutoplayBlocked: () => void };
  let position = 0, state = -1, plays = 0, loaded = "", blocked = false;
  const emitted: string[] = [];
  class Player {
    constructor(_id: string, options: { events: typeof events }) { events = options.events; }
    cueVideoById(input: { videoId: string }) { loaded = input.videoId; }
    playVideo() { plays++; if (blocked) events.onAutoplayBlocked(); else { state = 1; events.onStateChange({ data: 1 }); } }
    pauseVideo() { state = 2; }
    seekTo(value: number) { position = value; }
    getCurrentTime() { return position; } getDuration() { return 60; } getPlayerState() { return state; }
    getPlaybackRate() { return 1; } setPlaybackRate() {} destroy() {}
  }
  globalThis.window = { YT: { Player } } as unknown as Window & typeof globalThis;
  const provider = new YouTubeProvider({ id: "qa" } as HTMLIFrameElement, (event) => emitted.push(event.type));
  const controller = new MediaController({ youtube: () => provider }, () => undefined);
  try {
    const old = controller.sync({ ...media("youtube", 1), state: "playing", position: 10, startedAt: Date.now() - 2000 });
    const middle = controller.sync({ ...media("youtube", 2), position: 17 });
    const latest = controller.sync({ ...media("youtube", 3), position: 25 });
    await Promise.resolve(); events!.onReady(); await Promise.all([old, middle, latest]);
    assert.equal(loaded, "youtube-3"); assert.equal(position, 25); assert.equal(plays, 0); assert.equal(state, 2);
    const playing = { ...media("youtube", 4), state: "playing" as const, position: 20, startedAt: Date.now() - 2000 };
    blocked = true; await controller.sync(playing);
    assert.ok(position >= 22); assert.ok(emitted.includes("autoplay-blocked"));
    await controller.sync(media("youtube", 1), { force: true }); assert.equal(loaded, "youtube-4");
    blocked = false; controller.resumeFromGesture(); assert.equal(state, 1); assert.ok(position >= 22);
    assert.equal(plays, 2);
  } finally { controller.destroy(); globalThis.window = previousWindow; }
});

test("Drive pending metadata applies the latest paused revision instead of old PLAYING", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ url: "/api/google-drive/playback/test" })) as typeof fetch;
  let plays = 0;
  const video = Object.assign(new EventTarget(), { src: "", readyState: 0, paused: true, playbackRate: 1, currentTime: 0, duration: 60, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => { plays++; }, removeAttribute: () => undefined }) as unknown as HTMLVideoElement;
  const provider = new DriveProvider(video, "http://localhost:4000", "test", "room", () => undefined);
  try {
    const initial = { ...media("google-drive", 1), state: "playing" as const, position: 20, startedAt: Date.now() - 2000 };
    const joining = provider.sync(initial);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const paused = provider.sync({ ...initial, revision: 2, state: "paused", position: 35 });
    video.dispatchEvent(new Event("loadedmetadata")); await Promise.all([joining, paused]);
    assert.equal(plays, 0); assert.equal(video.currentTime, 35);
  } finally { provider.destroy(); globalThis.fetch = previousFetch; }
});

test("Drive late join waits for metadata before seeking and playing the authoritative snapshot", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ url: "/api/google-drive/playback/test" })) as typeof fetch;
  let plays = 0;
  const video = Object.assign(new EventTarget(), { src: "", readyState: 0, paused: true, playbackRate: 1, volume: 1, currentTime: 0, duration: 60, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => { plays += 1; }, removeAttribute: () => undefined }) as unknown as HTMLVideoElement;
  const provider = new DriveProvider(video, "http://localhost:4000", "test", "room", () => undefined);
  try {
    const joining = provider.sync({ ...media("google-drive", 1), state: "playing", position: 20, startedAt: Date.now() - 2000 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(plays, 0, "must not request playback before metadata readiness");
    Object.defineProperty(video, "readyState", { value: 1, configurable: true }); video.dispatchEvent(new Event("loadedmetadata"));
    await joining;
    assert.equal(plays, 1); assert.ok(video.currentTime >= 22);
  } finally { provider.destroy(); globalThis.fetch = previousFetch; }
});

test("Drive ready-first paused entry and blocked autoplay resume keep server authority", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ url: "/api/google-drive/playback/test" })) as typeof fetch;
  let blocked = true, plays = 0;
  const events: string[] = [], errors: string[] = [];
  const video = Object.assign(new EventTarget(), { src: "", readyState: 1, paused: true, playbackRate: 1, currentTime: 0, duration: 60, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => { plays++; if (blocked) throw new DOMException("User gesture required", "NotAllowedError"); }, removeAttribute: () => undefined }) as unknown as HTMLVideoElement;
  const provider = new DriveProvider(video, "http://localhost:4000", "test", "room", (event) => events.push(event.type));
  const controller = new MediaController({ "google-drive": () => provider }, (error) => errors.push(error));
  try {
    await controller.sync({ ...media("google-drive", 1), position: 31 });
    assert.equal(video.currentTime, 31); assert.equal(plays, 0);
    const playing = { ...media("google-drive", 2), state: "playing" as const, position: 20, startedAt: Date.now() - 2000 };
    await controller.sync(playing);
    assert.ok(events.includes("autoplay-blocked")); assert.equal(errors.at(-1), "User gesture required");
    blocked = false; await controller.resumeFromGesture();
    assert.ok(video.currentTime >= 22); assert.equal(plays, 2);
    await controller.sync(media("google-drive", 1), { force: true }); assert.ok(video.currentTime >= 22);
  } finally { controller.destroy(); globalThis.fetch = previousFetch; }
});

test("provider switching destroys each previous adapter", async () => {
  let created = 0, destroyed = 0;
  const adapter = (id: "youtube" | "google-drive") => {
    created += 1;
    return { id, sync: () => undefined, destroy: () => { destroyed += 1; }, getCapabilities: () => ({ playPause: true }), getCurrentTime: () => 0, getDuration: () => 0, getState: () => "paused", getAvailablePlaybackRates: () => [1], play: () => undefined, pause: () => undefined, seek: () => undefined, setPlaybackRate: () => undefined, setVolume: () => undefined, setMuted: () => undefined } as unknown as MediaProviderAdapter;
  };
  const controller = new MediaController({ youtube: () => adapter("youtube"), "google-drive": () => adapter("google-drive") }, () => undefined);
  for (let index = 0; index < 50; index += 1) await controller.sync(media(index % 2 ? "google-drive" : "youtube", index));
  controller.destroy();
  assert.equal(created, 50);
  assert.equal(destroyed, 50);
});

test("Drive ticket request is aborted when provider is destroyed", async () => {
  const previousFetch = globalThis.fetch;
  let observedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    observedSignal = init.signal ?? undefined;
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const video = Object.assign(new EventTarget(), { src: "", readyState: 1, paused: true, playbackRate: 1, volume: 1, currentTime: 0, duration: 0, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => undefined, removeAttribute: (name: string) => { if (name === "src") video.src = ""; } }) as unknown as HTMLVideoElement;
  try {
    const provider = new DriveProvider(video, "http://localhost:4000", "test-token", "test-room", () => undefined);
    const loading = provider.load(media("google-drive", 1));
    provider.destroy();
    await assert.rejects(loading, { name: "AbortError" });
    assert.equal(observedSignal?.aborted, true);
    assert.equal(video.src, "");
  } finally { globalThis.fetch = previousFetch; }
});

test("a stale Drive ticket cannot replace the newer video", async () => {
  const previousFetch = globalThis.fetch;
  let firstSignal: AbortSignal | undefined;
  let calls = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    calls += 1;
    if (calls === 1) return new Promise<Response>((_resolve, reject) => {
      firstSignal = init.signal ?? undefined;
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    return Promise.resolve(Response.json({ url: "/api/google-drive/playback/current" }));
  }) as typeof fetch;
  const video = Object.assign(new EventTarget(), { src: "", readyState: 1, paused: true, playbackRate: 1, volume: 1, currentTime: 0, duration: 0, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => undefined, removeAttribute: () => undefined }) as unknown as HTMLVideoElement;
  try {
    const provider = new DriveProvider(video, "http://localhost:4000", "test-token", "test-room", () => undefined);
    const oldLoad = provider.load(media("google-drive", 1));
    const newLoad = provider.load(media("google-drive", 2));
    await assert.rejects(oldLoad, { name: "AbortError" });
    await newLoad;
    assert.equal(firstSignal?.aborted, true);
    assert.equal(video.src, "http://localhost:4000/api/google-drive/playback/current");
    provider.destroy();
  } finally { globalThis.fetch = previousFetch; }
});
