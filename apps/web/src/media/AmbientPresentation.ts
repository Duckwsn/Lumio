import type { MediaState } from "@lumio/shared";

export type LyricsCapability = { available: false; reason: "provider-decision-required" };
// No approved lyrics integration exists. Arbitrary metadata/captions are not a licensed source.
export const lyricsCapability = (_media: MediaState): LyricsCapability => ({ available: false, reason: "provider-decision-required" });

export function artworkSource(media: MediaState): string | undefined {
  if (media.thumbnail) {
    try { const url = new URL(media.thumbnail); if (url.protocol === "https:" || url.protocol === "http:") return url.href; } catch { /* Invalid metadata falls back, not a broken image. */ }
  }
  if (media.provider === "youtube" && /^[a-zA-Z0-9_-]{11}$/.test(media.mediaId)) return `https://i.ytimg.com/vi/${media.mediaId}/hqdefault.jpg`;
  return undefined;
}

export function ambientMetadata(media: MediaState) {
  const channel = media.metadata?.channelTitle;
  return { title: media.title || "Mídia da Party", channel: typeof channel === "string" && channel.trim() ? channel : media.provider === "youtube" ? "YouTube" : "Google Drive", artwork: artworkSource(media), lyrics: lyricsCapability(media) };
}
