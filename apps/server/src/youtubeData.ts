import type { MediaSearchResult } from "@lumio/shared";

const SEARCH_TTL_MS = 10 * 60_000;
const VIDEO_TTL_MS = 45 * 60_000;
const SEARCH_PAGE_SIZE = 8;

interface CacheEntry<T> { expiresAt: number; value: T }
interface SearchPage { configured: true; results: MediaSearchResult[]; nextPageToken?: string }
interface YouTubeErrorPayload { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> } }
interface SearchPayload {
  nextPageToken?: string;
  items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } } }>;
}
interface VideoPayload {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
    contentDetails?: { duration?: string; regionRestriction?: { allowed?: string[]; blocked?: string[] } };
    status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
  }>;
}

export class YouTubeDataError extends Error {
  constructor(public readonly status: number, public readonly code: "NOT_CONFIGURED" | "QUOTA" | "RATE_LIMIT" | "INVALID" | "UNAVAILABLE" | "NOT_FOUND", message: string) {
    super(message);
  }
}

const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const decodeHtml = (value: string) => value
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

export const parseYouTubeDuration = (value: string | undefined) => {
  if (!value) return undefined;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
};

export class YouTubeDataService {
  private readonly searchCache = new Map<string, CacheEntry<SearchPage>>();
  private readonly videoCache = new Map<string, CacheEntry<MediaSearchResult | null>>();
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly apiKey = process.env.YOUTUBE_API_KEY) {}

  isConfigured() { return Boolean(this.apiKey); }

  checkRateLimit(identity: string) {
    const cutoff = Date.now() - 60_000;
    const recent = (this.requests.get(identity) ?? []).filter((time) => time > cutoff);
    if (recent.length >= 20) throw new YouTubeDataError(429, "RATE_LIMIT", "Muitas pesquisas em pouco tempo. Aguarde um minuto e tente novamente.");
    recent.push(Date.now()); this.requests.set(identity, recent);
  }

  async search(query: string, pageToken?: string): Promise<SearchPage> {
    this.requireConfigured();
    const normalized = normalizeQuery(query);
    const cacheKey = `${normalized}:${pageToken ?? "first"}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) { this.log(normalized, "HIT"); return cached.value; }
    this.log(normalized, "MISS");

    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet"); searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoEmbeddable", "true"); searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("maxResults", String(SEARCH_PAGE_SIZE)); searchUrl.searchParams.set("q", query.trim());
    if (pageToken) searchUrl.searchParams.set("pageToken", pageToken);
    searchUrl.searchParams.set("key", this.apiKey!);
    const searchPayload = await this.fetchJson<SearchPayload>(searchUrl);
    const ids = (searchPayload.items ?? []).flatMap((item) => item.id?.videoId ? [item.id.videoId] : []);
    const metadata = await this.getMany(ids);
    const results = ids.flatMap((id) => { const item = metadata.get(id); return item?.available ? [item] : []; });
    const page = { configured: true as const, results, nextPageToken: searchPayload.nextPageToken };
    this.searchCache.set(cacheKey, { value: page, expiresAt: Date.now() + SEARCH_TTL_MS });
    return page;
  }

  async getVideo(videoId: string) {
    try { this.requireConfigured(); }
    catch (error) { if (error instanceof YouTubeDataError && error.code === "NOT_CONFIGURED") return this.getOEmbedVideo(videoId); throw error; }
    let result: MediaSearchResult | null;
    try { result = (await this.getMany([videoId])).get(videoId) ?? null; }
    catch (error) { if (error instanceof YouTubeDataError && error.code === "QUOTA") return this.getOEmbedVideo(videoId); throw error; }
    if (!result) throw new YouTubeDataError(404, "NOT_FOUND", "Vídeo removido, privado ou indisponível.");
    if (!result.available) throw new YouTubeDataError(422, "INVALID", "Este vídeo não permite reprodução incorporada.");
    return result;
  }

  private async getOEmbedVideo(videoId: string): Promise<MediaSearchResult> {
    const cached = this.videoCache.get(videoId);
    if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`); url.searchParams.set("format", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new YouTubeDataError(404, "NOT_FOUND", "Vídeo removido, privado ou indisponível.");
    const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
    const item: MediaSearchResult = { id: `youtube:${videoId}`, provider: "youtube", providerMediaId: videoId, type: "video", title: data.title ?? "Vídeo do YouTube", channel: data.author_name ?? "YouTube", thumbnail: data.thumbnail_url, available: true, metadata: { channelTitle: data.author_name ?? "YouTube", metadataSource: "oembed" } };
    this.videoCache.set(videoId, { value: item, expiresAt: Date.now() + VIDEO_TTL_MS }); return item;
  }

  private async getMany(ids: string[]) {
    const result = new Map<string, MediaSearchResult | null>();
    const missing: string[] = [];
    for (const id of ids) {
      const cached = this.videoCache.get(id);
      if (cached && cached.expiresAt > Date.now()) result.set(id, cached.value); else missing.push(id);
    }
    if (missing.length) {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails,status"); url.searchParams.set("id", missing.join(",")); url.searchParams.set("key", this.apiKey!);
      const payload = await this.fetchJson<VideoPayload>(url);
      const found = new Set<string>();
      for (const video of payload.items ?? []) {
        if (!video.id || !video.snippet) continue;
        found.add(video.id);
        const available = video.status?.embeddable !== false && video.status?.privacyStatus !== "private" && video.status?.uploadStatus !== "rejected";
        const item: MediaSearchResult = {
          id: `youtube:${video.id}`, provider: "youtube", providerMediaId: video.id, type: "video",
          title: decodeHtml(video.snippet.title ?? "Vídeo do YouTube"), channel: decodeHtml(video.snippet.channelTitle ?? "YouTube"),
          thumbnail: video.snippet.thumbnails?.high?.url ?? video.snippet.thumbnails?.medium?.url,
          duration: parseYouTubeDuration(video.contentDetails?.duration), available,
          metadata: { channelTitle: decodeHtml(video.snippet.channelTitle ?? "YouTube"), regionRestriction: video.contentDetails?.regionRestriction },
        };
        result.set(video.id, item); this.videoCache.set(video.id, { value: item, expiresAt: Date.now() + VIDEO_TTL_MS });
      }
      for (const id of missing) if (!found.has(id)) { result.set(id, null); this.videoCache.set(id, { value: null, expiresAt: Date.now() + VIDEO_TTL_MS }); }
    }
    return result;
  }

  private requireConfigured() {
    if (!this.apiKey) throw new YouTubeDataError(503, "NOT_CONFIGURED", "A busca do YouTube ainda não foi configurada.");
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => ({})) as T & YouTubeErrorPayload;
    if (response.ok) return payload;
    const reason = payload.error?.errors?.[0]?.reason;
    if (reason?.toLowerCase().includes("quota") || reason?.includes("dailyLimit")) throw new YouTubeDataError(429, "QUOTA", "A cota de pesquisa do YouTube foi atingida. Você ainda pode colar uma URL.");
    if (response.status === 400) throw new YouTubeDataError(400, "INVALID", "A pesquisa enviada não é válida.");
    if (response.status === 429 || reason?.toLowerCase().includes("ratelimit")) throw new YouTubeDataError(429, "RATE_LIMIT", "O YouTube limitou as pesquisas temporariamente. Tente novamente em instantes.");
    throw new YouTubeDataError(502, "UNAVAILABLE", "Não conseguimos pesquisar no YouTube agora. Você ainda pode colar uma URL.");
  }

  private log(query: string, cache: "HIT" | "MISS") {
    if (process.env.NODE_ENV !== "production") console.info(`YouTube search query=${JSON.stringify(query)} cache=${cache}`);
  }
}
