import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import type { MediaItem } from "@lumio/shared";

export function NowPlayingFavorite({ apiUrl, token, roomId, item, revision, onError }: {
  apiUrl: string; token: string; roomId: string; item: MediaItem; revision: number;
  onError: (message: string) => void;
}) {
  const [favorite, setFavorite] = useState(false);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const identity = `${item.provider}:${item.providerMediaId}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ provider: item.provider, providerMediaId: item.providerMediaId });
    void fetch(`${apiUrl}/api/media-hub/${roomId}/status?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível consultar os favoritos.");
      return response.json() as Promise<{ favorite: boolean }>;
    }).then((status) => { if (!controller.signal.aborted) setFavorite(status.favorite); })
      .catch((error) => { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "Não foi possível consultar os favoritos."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiUrl, token, roomId, identity, revision, onError]);

  const toggle = async () => {
    if (pending || loading) return;
    setPending(true);
    const next = !favorite;
    try {
      const response = await fetch(`${apiUrl}/api/media-hub/${roomId}/favorite`, {
        method: next ? "PUT" : "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(data?.message ?? "Não foi possível alterar o favorito.");
      }
      const data = await response.json() as { active: boolean };
      setFavorite(data.active);
    } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível alterar o favorito."); }
    finally { setPending(false); }
  };

  return <button className={`now-playing-favorite${favorite ? " is-active" : ""}`} type="button" disabled={pending || loading}
    aria-pressed={favorite} aria-label={favorite ? "Remover dos favoritos da Casa" : "Salvar nos favoritos da Casa"}
    title={favorite ? "Remover dos favoritos da Casa" : "Salvar nos favoritos da Casa"} onClick={() => void toggle()}>
    <Heart size={18} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
    <span>{pending ? "Salvando…" : favorite ? "Salvo" : "Favoritar"}</span>
  </button>;
}
