import test from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeDuration, YouTubeDataError, YouTubeDataService } from "./youtubeData.js";

test("parses YouTube ISO 8601 durations", () => {
  assert.equal(parseYouTubeDuration("PT4M13S"), 253);
  assert.equal(parseYouTubeDuration("PT1H2M3S"), 3723);
  assert.equal(parseYouTubeDuration("P1DT1S"), 86401);
  assert.equal(parseYouTubeDuration("invalid"), undefined);
});

test("rate limiter blocks the twenty-first request for one identity", () => {
  const service = new YouTubeDataService("test-key");
  for (let index = 0; index < 20; index += 1) service.checkRateLimit("duck");
  assert.throws(() => service.checkRateLimit("duck"), (error) => error instanceof YouTubeDataError && error.code === "RATE_LIMIT");
  assert.doesNotThrow(() => service.checkRateLimit("another-user"));
});

test("search cache avoids repeating upstream requests", async () => {
  const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests += 1; const url = new URL(String(input));
    if (url.pathname.endsWith("/search")) return new Response(JSON.stringify({ items: [{ id: { videoId: "abcdefghijk" } }] }), { status: 200 });
    return new Response(JSON.stringify({ items: [{ id: "abcdefghijk", snippet: { title: "Cached video", channelTitle: "Lumio" }, contentDetails: { duration: "PT1M" }, status: { embeddable: true, privacyStatus: "public", uploadStatus: "processed" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const service = new YouTubeDataService("test-key");
    const first = await service.search("cached query"); const second = await service.search("  CACHED   query ");
    assert.equal(first.results[0]?.duration, 60); assert.equal(second.results[0]?.title, "Cached video"); assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; }
});
