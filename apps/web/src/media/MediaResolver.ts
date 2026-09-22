import type { MediaItem, QueueItem, User } from "@lumio/shared";

export const youtubeIdFromInput = (value: string) => {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
      const candidate = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? "";
      return /^[\w-]{11}$/.test(candidate) ? candidate : "";
    }
  } catch { return ""; }
  return "";
};

export const isDriveReference = (input: string) => /drive\.google\.com/i.test(input.trim());

export async function resolveMediaInput(input: string, options: { apiUrl: string; token: string; title?: string; thumbnail?: string }): Promise<MediaItem> {
  const value = input.trim();
  if (isDriveReference(value)) {
    const response = await fetch(`${options.apiUrl}/api/google-drive/resolve?input=${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${options.token}` } });
    const data = await response.json() as { item?: MediaItem; message?: string };
    if (!response.ok || !data.item) throw new Error(data.message ?? "Não foi possível resolver o arquivo do Drive.");
    return data.item;
  }
  const providerMediaId = youtubeIdFromInput(value);
  if (!providerMediaId) throw new Error("Cole uma URL válida do YouTube ou Google Drive.");
  const response = await fetch(`${options.apiUrl}/api/youtube/videos/${providerMediaId}`, { headers: { Authorization: `Bearer ${options.token}` } });
  const data = await response.json() as { item?: MediaItem; message?: string };
  if (!response.ok || !data.item) throw new Error(data.message ?? "Não foi possível validar este vídeo do YouTube.");
  return data.item;
}

export function toQueueItem(item: MediaItem, user: User): QueueItem {
  return {
    ...item,
    id: crypto.randomUUID(),
    addedBy: { id: user.id, displayName: user.displayName, color: user.color },
    addedAt: new Date().toISOString(),
  };
}
