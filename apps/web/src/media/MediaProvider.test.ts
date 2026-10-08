import assert from "node:assert/strict";
import test from "node:test";
import type { MediaState } from "@lumio/shared";
import { DriveProvider, YouTubeProvider, MediaController, expectedPosition, shouldApplyMedia, youtubePlaybackError, type MediaProviderAdapter } from "./MediaProvider";

test("equal-revision playback snapshots cannot rewind a newer position", () => {
  const current = { ...media("youtube", 10), state: "playing" as const, position: 30 };
  assert.equal(shouldApplyMedia({ ...current, position: 20 }, current), false);
  assert.equal(shouldApplyMedia({ ...current, position: 31 }, current), true);
  assert.equal(shouldApplyMedia({ ...current, revision: 9, position: 40 }, current), false);
  assert.equal(shouldApplyMedia({ ...current, revision: 11, position: 5 }, current), true, "a newer seek may intentionally move backward");
});
import { shouldDismissSheet } from "../components/MobileBottomSheet";

const media = (provider: "youtube" | "google-drive", revision: number): MediaState => ({ mediaId: `${provider}-${revision}`, provider, type: "video", title: "Teste", state: "paused", position: 0, duration: 60, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "test", revision });

test("secondary sheet dismissal combines distance and downward velocity", () => {
  assert.equal(shouldDismissSheet(200, 400, 0), true);
  assert.equal(shouldDismissSheet(20, 400, 0), false);
  assert.equal(shouldDismissSheet(20, 400, 0.5), true);
  assert.equal(shouldDismissSheet(0, 400, 0.5), false);
  assert.equal(shouldDismissSheet(20, 400, -0.5), false);
});

test("unknown duration does not rewind a late-joining player to zero", () => {
  const now = Date.now();
  assert.equal(expectedPosition({ ...media("youtube", 1), state: "playing", position: 12, duration: 0, startedAt: now - 3_000 }, now), 15);
  assert.equal(expectedPosition({ ...media("youtube", 1), state: "playing", position: 58, duration: 60, startedAt: now - 5_000 }, now), 60);
});

test("official YouTube errors distinguish embed restriction, missing video and origin configuration", () => {
  assert.equal(youtubePlaybackError(101).code, "EMBED_RESTRICTED");
  assert.equal(youtubePlaybackError(150).code, "EMBED_RESTRICTED");
  assert.equal(youtubePlaybackError(100).code, "MEDIA_UNAVAILABLE");
  assert.equal(youtubePlaybackError(153).code, "PROVIDER_ERROR");
  assert.equal(youtubePlaybackError(5).code, "UNSUPPORTED_FORMAT");
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

test("YouTube API script failure is bounded and a user retry can recover", async () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const scripts: Array<EventTarget & { src: string; async: boolean; isConnected: boolean; remove: () => void }> = [];
  const documentMock = {
    querySelector: () => null,
    createElement: () => {
      const script = Object.assign(new EventTarget(), { src: "", async: false, isConnected: false, remove() { script.isConnected = false; } });
      scripts.push(script); return script;
    },
    head: { append: (script: (typeof scripts)[number]) => { script.isConnected = true; } },
  };
  globalThis.window = { setTimeout, clearTimeout } as unknown as Window & typeof globalThis;
  globalThis.document = documentMock as unknown as Document;
  const errors: string[] = [];
  let cues = 0;
  const controller = new MediaController({ youtube: () => new YouTubeProvider({ id: "retry-iframe" } as HTMLIFrameElement, () => undefined) }, (message) => errors.push(message));
  try {
    const initial = controller.sync(media("youtube", 1));
    scripts[0].dispatchEvent(new Event("error"));
    await initial;
    assert.match(errors.at(-1) ?? "", /carregar o player do YouTube/);
    assert.equal(scripts[0].isConnected, false);
    class Player {
      constructor(_id: string, options: { events: { onReady: () => void } }) { queueMicrotask(options.events.onReady); }
      cueVideoById() { cues++; } getCurrentTime() { return 0; } getDuration() { return 60; }
      getPlayerState() { return 2; } getPlaybackRate() { return 1; }
      getAvailablePlaybackRates() { return [1]; } pauseVideo() {} destroy() {}
    }
    globalThis.window.YT = { Player } as unknown as NonNullable<Window["YT"]>;
    await controller.retry(media("youtube", 1));
    assert.equal(cues, 1);
    assert.equal(errors.at(-1), "");
  } finally { controller.destroy(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test("a late YouTube ended event for the prior video cannot advance the new one", async () => {
  const previousWindow = globalThis.window;
  let events: { onReady: () => void; onStateChange: (event: { data: number }) => void };
  let videoId = "";
  const emitted: string[] = [];
  class Player {
    constructor(_id: string, options: { events: typeof events }) { events = options.events; }
    cueVideoById(input: { videoId: string }) { if (!videoId) videoId = input.videoId; }
    getVideoUrl() { return `https://www.youtube.com/watch?v=${videoId}`; }
    getCurrentTime() { return 0; } getDuration() { return 60; } getPlayerState() { return 2; }
    getPlaybackRate() { return 1; } getAvailablePlaybackRates() { return [1]; }
    pauseVideo() {} destroy() {}
  }
  globalThis.window = { YT: { Player } } as unknown as Window & typeof globalThis;
  const provider = new YouTubeProvider({ id: "stale-iframe" } as HTMLIFrameElement, (event) => emitted.push(event.type));
  try {
    const first = provider.sync(media("youtube", 1));
    await Promise.resolve(); events!.onReady(); await first;
    await provider.sync(media("youtube", 2));
    events!.onStateChange({ data: 0 });
    assert.equal(emitted.includes("ended"), false);
    videoId = "youtube-2";
    events!.onStateChange({ data: 0 });
    assert.equal(emitted.filter((type) => type === "ended").length, 1);
  } finally { provider.destroy(); globalThis.window = previousWindow; }
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

test("a reconnect snapshot can reset the controller revision after a server restart", async () => {
  const applied: number[] = [];
  const adapter = { id: "youtube", sync: (state: { revision: number }) => { applied.push(state.revision); }, destroy: () => undefined, getState: () => "paused" } as unknown as MediaProviderAdapter;
  const controller = new MediaController({ youtube: () => adapter }, () => undefined);
  await controller.sync(media("youtube", 12));
  await controller.sync(media("youtube", 1));
  assert.deepEqual(applied, [12], "an ordinary stale event remains rejected");
  controller.resetRevision();
  await controller.sync(media("youtube", 1));
  assert.deepEqual(applied, [12, 1], "a new authoritative connection may start at a lower revision");
  controller.destroy();
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

test("Drive unsupported codec reports a permanent error without renewing a ticket", () => {
  const events: string[] = [];
  const video = Object.assign(new EventTarget(), { error: { code: 4 }, pause: () => undefined, removeAttribute: () => undefined, load: () => undefined }) as unknown as HTMLVideoElement;
  const provider = new DriveProvider(video, "http://localhost:4000", "test", "room", (event) => { if (event.type === "error") events.push(event.code); });
  try {
    video.dispatchEvent(new Event("error"));
    assert.deepEqual(events, ["UNSUPPORTED_FORMAT"]);
  } finally { provider.destroy(); }
});

test("Drive network failure renews one ticket and preserves the playback position", async () => {
  const previousFetch = globalThis.fetch;
  let tickets = 0, plays = 0;
  globalThis.fetch = (async () => Response.json({ url: `/api/google-drive/playback/test-${++tickets}` })) as typeof fetch;
  const events: string[] = [];
  const video = Object.assign(new EventTarget(), {
    src: "", error: { code: 2 }, readyState: 1, paused: false, ended: false, playbackRate: 1,
    currentTime: 18, duration: 60, canPlayType: () => "probably", load: () => undefined,
    pause: () => undefined, play: async () => { plays++; }, removeAttribute: () => undefined,
  }) as unknown as HTMLVideoElement;
  const provider = new DriveProvider(video, "http://localhost:4000", "test", "room", (event) => events.push(event.type));
  try {
    await provider.sync({ ...media("google-drive", 1), state: "playing", position: 18, startedAt: Date.now() });
    assert.equal(tickets, 1);
    video.dispatchEvent(new Event("error"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tickets, 2);
    video.currentTime = 0;
    video.dispatchEvent(new Event("loadedmetadata"));
    assert.ok(video.currentTime >= 18);
    assert.ok(plays >= 1);
    video.dispatchEvent(new Event("error"));
    assert.equal(tickets, 2);
    assert.ok(events.includes("error"));
  } finally { provider.destroy(); globalThis.fetch = previousFetch; }
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
