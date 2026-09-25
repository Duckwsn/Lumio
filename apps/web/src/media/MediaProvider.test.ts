import assert from "node:assert/strict";
import test from "node:test";
import type { MediaState } from "@lumio/shared";
import { DriveProvider, MediaController, type MediaProviderAdapter } from "./MediaProvider";

const media = (provider: "youtube" | "google-drive", revision: number): MediaState => ({ mediaId: `${provider}-${revision}`, provider, type: "video", title: "Teste", state: "paused", position: 0, duration: 60, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "test", revision });

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
  const video = Object.assign(new EventTarget(), { src: "", paused: true, playbackRate: 1, volume: 1, currentTime: 0, duration: 0, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => undefined, removeAttribute: (name: string) => { if (name === "src") video.src = ""; } }) as unknown as HTMLVideoElement;
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
  const video = Object.assign(new EventTarget(), { src: "", paused: true, playbackRate: 1, volume: 1, currentTime: 0, duration: 0, canPlayType: () => "probably", load: () => undefined, pause: () => undefined, play: async () => undefined, removeAttribute: () => undefined }) as unknown as HTMLVideoElement;
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
