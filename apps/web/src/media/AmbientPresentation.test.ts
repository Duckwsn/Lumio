import test from "node:test";
import assert from "node:assert/strict";
import type { MediaState } from "@lumio/shared";
import { ambientMetadata, artworkSource, lyricsCapability } from "./AmbientPresentation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaStage } from "../components/MediaStage";

const media = (provider: MediaState["provider"]): MediaState => ({ provider, mediaId: "dQw4w9WgXcQ", type: "video", title: "Documentário, não música", state: "paused", position: 17, duration: 90, playbackRate: 1, startedAt: null, updatedAt: 0, controlledBy: "qa", revision: 2 });

test("artwork selects existing metadata, legitimate YouTube thumbnail or Drive fallback", () => {
  assert.equal(artworkSource({ ...media("youtube"), thumbnail: "https://example.test/art.png" }), "https://example.test/art.png");
  assert.equal(artworkSource(media("youtube")), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(artworkSource(media("google-drive")), undefined);
  assert.equal(artworkSource({ ...media("google-drive"), thumbnail: "javascript:alert(1)" }), undefined);
  assert.equal(artworkSource({ ...media("youtube"), mediaId: "../invalid" }), undefined);
});

test("presentation does not infer music/lyrics from title or untrusted metadata and does not mutate sync", () => {
  const input = { ...media("youtube"), metadata: { channelTitle: "Canal", lyrics: "not an approved source" } };
  const before = JSON.stringify(input);
  assert.deepEqual(lyricsCapability(input), { available: false, reason: "provider-decision-required" });
  assert.equal(ambientMetadata(input).channel, "Canal");
  assert.equal(JSON.stringify(input), before);
  assert.equal(ambientMetadata({ ...media("google-drive"), title: "", metadata: {} }).title, "Mídia da Party");
  assert.equal(ambientMetadata(media("google-drive")).channel, "Google Drive");
});

test("Drive alternate presentation keeps one video and one control surface with brand fallback", () => {
  const noop = () => undefined;
  const props = { media: media("google-drive"), roomId: "qa", onSkip: noop, onRemove: noop, onAddMedia: noop, onPlaybackCommand: () => true, onEnded: noop, apiUrl: "https://api.example.test", token: "local-fixture", theater: false, onTheaterChange: noop, onFullscreenChange: noop, onMusicViewChange: noop, ambient: true, musicView: true, volume: 50, effectiveVolume: 50, onVolumeChange: noop, resyncToken: 0 };
  const html = renderToStaticMarkup(createElement(MediaStage, props));
  assert.equal((html.match(/<video /g) ?? []).length, 1);
  assert.equal((html.match(/class="lumio-controls"/g) ?? []).length, 1);
  assert.match(html, /is-music-view/);
  assert.match(html, /data-lyrics="unavailable"/);
  assert.match(html, /lumio-symbol-128.png/);
  assert.doesNotMatch(html, /player-error/);
  const normal = renderToStaticMarkup(createElement(MediaStage, { ...props, musicView: false }));
  assert.equal((normal.match(/<video /g) ?? []).length, 1);
  assert.doesNotMatch(normal, /class="music-presentation"/);
});
