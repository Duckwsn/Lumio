import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, Cloud, Folder, Heart, History, ListMusic, MoreHorizontal, Play, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import type { HouseHistoryEntry, HouseLibraryItem, MediaItem, MediaSearchResult, Playlist } from "@lumio/shared";
import { isDriveReference, resolveMediaInput, youtubeIdFromInput } from "../media/MediaResolver";
import { ConfirmDialog } from "./ConfirmDialog";

interface SearchPage { results?: MediaSearchResult[]; nextPageToken?: string; message?: string }
interface HubData {
  library: HouseLibraryItem[];
  libraryKeys: string[];
  libraryTotal: number;
  nextCursor: number | null;
  favorites: HouseLibraryItem[];
  recent: HouseHistoryEntry[];
  playlists: Playlist[];
  continueWatching: Array<{ item: MediaItem; position: number; updatedAt: string }>;
}
interface DriveStatus { configured: boolean; connected: boolean; email?: string }
type HubTab = "discover" | "library" | "playlists" | "history" | "drive";
type QueueMode = "append" | "next" | "replace";

const emptyHub: HubData = { library: [], libraryKeys: [], libraryTotal: 0, nextCursor: null, favorites: [], recent: [], playlists: [], continueWatching: [] };
const keyOf = (item: Pick<MediaItem, "provider" | "providerMediaId">) => `${item.provider}:${item.providerMediaId}`;
const asMedia = (item: MediaItem): MediaItem => ({ id: item.id, provider: item.provider, providerMediaId: item.providerMediaId, type: item.type, title: item.title, thumbnail: item.thumbnail, duration: item.duration, mimeType: item.mimeType, metadata: item.metadata, creator: item.creator, canonicalUrl: item.canonicalUrl, available: item.available });
const MediaActionsContext = createContext({ canAdd: true, canControl: true, canSave: true, canCreatePlaylist: true, canEditPlaylist: true, canDeletePlaylist: true });

export function MediaHub({ apiUrl, token, roomId, queueRevision, refreshSignal, permissions, canAdd, canControl, onClose, onAdd, onPlayNext }: {
  apiUrl: string; token: string; roomId: string; queueRevision: number; refreshSignal: number; permissions: string[]; canAdd: boolean; canControl: boolean; onClose: () => void;
  onAdd: (item: MediaItem, playNow: boolean) => Promise<{ position: number }>;
  onPlayNext: (item: MediaItem) => Promise<void>;
}) {
  const [tab, setTab] = useState<HubTab>("discover");
  const [hub, setHub] = useState<HubData>(emptyHub);
  const [drive, setDrive] = useState<DriveStatus>({ configured: false, connected: false });
  const [driveStatusLoading, setDriveStatusLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState<{ items: HouseLibraryItem[]; total: number; nextCursor: number | null }>({ items: [], total: 0, nextCursor: null });
  const [libraryLoading, setLibraryLoading] = useState(false);
  const libraryGeneration = useRef(0);
  const [historyPage, setHistoryPage] = useState<{ items: HouseHistoryEntry[]; total: number; nextCursor: number | null }>({ items: [], total: 0, nextCursor: null });
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyGeneration = useRef(0);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const searchGeneration = useRef(0);
  const debounceRef = useRef<number>();
  const feedbackTimer = useRef<number>();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const actionAccess = useMemo(() => ({ canAdd, canControl, canSave: permissions.includes("LIBRARY_MANAGE"), canCreatePlaylist: permissions.includes("PLAYLIST_CREATE"), canEditPlaylist: permissions.includes("PLAYLIST_EDIT"), canDeletePlaylist: permissions.includes("PLAYLIST_DELETE") }), [canAdd, canControl, permissions]);

  const notify = useCallback((text: string) => { setFeedback(text); window.clearTimeout(feedbackTimer.current); feedbackTimer.current = window.setTimeout(() => setFeedback(""), 3200); }, []);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    const data = response.status === 204 ? undefined : await response.json().catch(() => undefined) as T & { message?: string };
    if (!response.ok) throw new Error(data?.message ?? "Não foi possível concluir esta ação."); return data as T;
  }, [apiUrl, headers]);

  const refresh = useCallback(async () => {
    try {
      const hubData = await request<HubData>(`/api/media-hub/${roomId}?limit=60`);
      setHub(hubData);
      if (selectedPlaylist) { const detail = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${selectedPlaylist.id}`); setSelectedPlaylist(detail.playlist); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir o Media Hub."); }
  }, [request, roomId, selectedPlaylist?.id]);

  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);
  useEffect(() => { if (tab !== "drive") return; let active = true; setDriveStatusLoading(true); void request<DriveStatus>("/api/google-drive/status").then((status) => { if (active) setDrive(status); }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Não foi possível consultar o Drive."); }).finally(() => { if (active) setDriveStatusLoading(false); }); return () => { active = false; }; }, [tab, refreshSignal, request]);
  useEffect(() => {
    if (tab !== "library") return;
    const generation = ++libraryGeneration.current;
    setLibraryLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: "60" });
      if (libraryQuery.trim()) params.set("q", libraryQuery.trim());
      if (libraryFilter !== "all") params.set("filter", libraryFilter);
      void request<HubData>(`/api/media-hub/${roomId}?${params}`).then((data) => { if (generation === libraryGeneration.current) setLibraryPage({ items: data.library, total: data.libraryTotal, nextCursor: data.nextCursor }); }).catch((error) => { if (generation === libraryGeneration.current) setMessage(error instanceof Error ? error.message : "Não foi possível carregar a biblioteca."); }).finally(() => { if (generation === libraryGeneration.current) setLibraryLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); libraryGeneration.current += 1; };
  }, [tab, libraryQuery, libraryFilter, refreshSignal, roomId, request, hub.library]);
  useEffect(() => {
    if (tab !== "history") return;
    const generation = ++historyGeneration.current; setHistoryLoading(true);
    void request<{ items: HouseHistoryEntry[]; total: number; nextCursor: number | null }>(`/api/media-hub/${roomId}/history?limit=30`).then((page) => { if (generation === historyGeneration.current) setHistoryPage(page); }).catch((error) => { if (generation === historyGeneration.current) setMessage(error instanceof Error ? error.message : "Não foi possível carregar o histórico."); }).finally(() => { if (generation === historyGeneration.current) setHistoryLoading(false); });
    return () => { historyGeneration.current += 1; };
  }, [tab, refreshSignal, hub.recent, roomId, request]);
  const loadMoreHistory = async () => {
    if (historyPage.nextCursor === null || historyLoading) return;
    const generation = historyGeneration.current;
    setHistoryLoading(true);
    try { const page = await request<{ items: HouseHistoryEntry[]; total: number; nextCursor: number | null }>(`/api/media-hub/${roomId}/history?limit=30&cursor=${historyPage.nextCursor}`); if (generation === historyGeneration.current) setHistoryPage((current) => ({ items: [...current.items, ...page.items], total: page.total, nextCursor: page.nextCursor })); }
    catch (error) { if (generation === historyGeneration.current) setMessage(error instanceof Error ? error.message : "Não foi possível carregar mais histórico."); }
    finally { if (generation === historyGeneration.current) setHistoryLoading(false); }
  };
  const loadMoreLibrary = async () => {
    if (libraryPage.nextCursor === null || libraryLoading) return;
    const generation = libraryGeneration.current;
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ limit: "60", cursor: String(libraryPage.nextCursor) });
      if (libraryQuery.trim()) params.set("q", libraryQuery.trim());
      if (libraryFilter !== "all") params.set("filter", libraryFilter);
      const data = await request<HubData>(`/api/media-hub/${roomId}?${params}`);
      if (generation === libraryGeneration.current) setLibraryPage((current) => ({ items: [...current.items, ...data.library], total: data.libraryTotal, nextCursor: data.nextCursor }));
    } catch (error) { if (generation === libraryGeneration.current) setMessage(error instanceof Error ? error.message : "Não foi possível carregar mais itens."); }
    finally { if (generation === libraryGeneration.current) setLibraryLoading(false); }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") playlistTarget || confirmDelete ? (setPlaylistTarget(null), setConfirmDelete(false)) : onClose(); };
    const onMessage = (event: MessageEvent) => { if (event.origin !== apiUrl || event.source === window) return; if (event.data?.type === "lumio:drive-connected") { setDriveStatusLoading(true); void request<DriveStatus>("/api/google-drive/status").then(setDrive).catch(() => setMessage("Não foi possível confirmar a conexão com o Drive.")).finally(() => setDriveStatusLoading(false)); setTab("drive"); } else if (event.data?.type === "lumio:drive-cancelled") setMessage("Conexão com Google Drive cancelada."); };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("message", onMessage); dialogRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("message", onMessage); requestRef.current?.abort(); window.clearTimeout(feedbackTimer.current); };
  }, [apiUrl, confirmDelete, onClose, playlistTarget, request]);

  const runYouTubeSearch = useCallback(async (value: string, pageToken?: string, append = false) => {
    const normalized = value.trim(); if (normalized.length < 3) return;
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller; const generation = ++searchGeneration.current; setBusy(true); setSearchState("loading"); setMessage(""); setLastQuery(normalized);
    try {
      const params = new URLSearchParams({ q: normalized }); if (pageToken) params.set("pageToken", pageToken);
      const page = await request<SearchPage>(`/api/youtube/search?${params}`, { signal: controller.signal });
      if (generation !== searchGeneration.current) return;
      setResults((current) => append ? [...new Map([...current, ...(page.results ?? [])].map((item) => [keyOf(item), item])).values()] : page.results ?? []); setNextPageToken(page.nextPageToken); setSearchState(page.results?.length || append ? "ready" : "empty");
    } catch (error) { if (generation === searchGeneration.current && (error as Error).name !== "AbortError") { setSearchState("error"); setMessage(error instanceof Error ? error.message : "Não conseguimos pesquisar no YouTube agora."); } }
    finally { if (generation === searchGeneration.current) setBusy(false); }
  }, [request]);

  useEffect(() => {
    const value = query.trim();
    if (tab !== "discover" || value.length < 3 || value.startsWith("http") || isDriveReference(value) || youtubeIdFromInput(value)) { requestRef.current?.abort(); searchGeneration.current += 1; setBusy(false); setResults([]); setNextPageToken(undefined); setSearchState("idle"); setMessage(""); return; }
    setResults([]); setNextPageToken(undefined); setSearchState("loading"); setMessage("");
    debounceRef.current = window.setTimeout(() => void runYouTubeSearch(value), 450);
    return () => { window.clearTimeout(debounceRef.current); requestRef.current?.abort(); searchGeneration.current += 1; };
  }, [query, runYouTubeSearch, tab]);

  const submitSearch = async () => {
    const value = query.trim(); if (!value) return;
    window.clearTimeout(debounceRef.current);
    if (value.startsWith("http") || isDriveReference(value) || youtubeIdFromInput(value)) {
      setBusy(true); setMessage("");
      try { if (!canAdd) throw new Error("Você não tem permissão para alterar a fila."); const result = await onAdd(await resolveMediaInput(value, { apiUrl, token }), false); notify(`Mídia adicionada à fila · posição ${result.position}.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir esta mídia."); }
      finally { setBusy(false); } return;
    }
    if (value === lastQuery && searchState === "ready") return;
    await runYouTubeSearch(value);
  };

  const add = async (item: MediaItem, playNow: boolean) => { try { if (!canAdd || playNow && !canControl) throw new Error("Você não tem permissão para esta ação."); const result = await onAdd(asMedia(item), playNow); notify(playNow ? `Reproduzindo agora: ${item.title}` : `Adicionado à fila: ${item.title} · posição ${result.position}`); if (playNow) onClose(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível adicionar à fila."); } };
  const playNext = async (item: MediaItem) => { try { if (!canAdd) throw new Error("Você não tem permissão para alterar a fila."); await onPlayNext(asMedia(item)); notify(`A seguir: ${item.title}`); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível alterar a fila."); } };
  const saveLibrary = async (item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/library`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); notify("Salvo na biblioteca da Casa."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const removeLibrary = async (item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/library`, { method: "DELETE", body: JSON.stringify({ item: asMedia(item) }) }); notify("Removido da biblioteca."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const toggleFavorite = async (item: MediaItem) => { try { const result = await request<{ active: boolean }>(`/api/media-hub/${roomId}/favorite`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); notify(result.active ? "Adicionado aos favoritos da Casa." : "Removido dos favoritos."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const openPlaylist = async (playlist: Playlist) => { setBusy(true); try { const detail = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}`); setSelectedPlaylist(detail.playlist); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const addToPlaylist = async (playlistId: string, item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/playlists/${playlistId}/items`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); setPlaylistTarget(null); notify("Adicionado à playlist."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const queuePlaylist = async (playlist: Playlist, mode: QueueMode, playNow = false) => { try { if (!canAdd || (playNow || mode === "replace") && !canControl) throw new Error("Você não tem permissão para esta ação."); const result = await request<{ skipped?: number }>(`/api/media-hub/${roomId}/playlists/${playlist.id}/queue`, { method: "POST", body: JSON.stringify({ mode, playNow, revision: queueRevision }) }); notify(`${playNow ? `Reproduzindo ${playlist.name}.` : mode === "next" ? "Playlist colocada a seguir." : "Playlist adicionada à fila."}${result.skipped ? ` ${result.skipped} item(ns) indisponível(is) ignorado(s).` : ""}`); if (playNow) onClose(); } catch (error) { setMessage((error as Error).message); } };

  const favoriteKeys = useMemo(() => new Set(hub.favorites.map(keyOf)), [hub.favorites]);
  const savedKeys = useMemo(() => new Set(hub.libraryKeys), [hub.libraryKeys]);
  const searching = tab === "discover" && Boolean(query.trim());

  return <MediaActionsContext.Provider value={actionAccess}><div className="hub-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="media-hub media-hub-v2" role="dialog" aria-modal="true" aria-labelledby="media-hub-title" tabIndex={-1} ref={dialogRef}>
      <header className="hub-header"><div><span className="eyebrow">Media Hub</span><h2 id="media-hub-title">A mídia da Casa</h2><p>Encontre, guarde e monte a fila da noite.</p></div><button className="dialog-close" onClick={onClose} aria-label="Fechar Media Hub"><X size={19} /></button></header>
      {tab === "discover" ? <form className="hub-search" onSubmit={(event) => { event.preventDefault(); void submitSearch(); }}><label className="sr-only" htmlFor="media-search">Pesquisar no YouTube ou colar URL</label><input id="media-search" autoFocus={!window.matchMedia("(pointer: coarse)").matches} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar no YouTube ou colar uma URL…" /><button type="submit" disabled={busy || !query.trim()}><Search size={17} /> {busy ? "Buscando…" : "Buscar"}</button></form> : null}
      {feedback ? <div className="hub-feedback" role="status" aria-live="polite"><Check size={17} />{feedback}</div> : null}
      {message ? <div className="hub-message" role="alert"><span>{message}</span>{tab === "discover" && searchState === "error" && lastQuery === query.trim() ? <button onClick={() => void runYouTubeSearch(lastQuery)}><RefreshCw size={15} /> Tentar novamente</button> : null}</div> : null}
      <nav className="hub-tabs" aria-label="Media Hub">{([['discover','Descobrir'],['library','Biblioteca'],['playlists','Playlists'],['history','Histórico'],['drive','Google Drive']] as Array<[HubTab,string]>).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setMessage(""); }}>{label}</button>)}</nav>
      <div className="hub-content">
        {searching ? <SearchView query={query} remote={results} busy={busy} searchState={searchState} nextPageToken={nextPageToken} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={hub.playlists} onAdd={add} onPlayNext={playNext} onSave={saveLibrary} onFavorite={toggleFavorite} onPlaylist={setPlaylistTarget} onMore={() => void runYouTubeSearch(lastQuery, nextPageToken, true)} /> : null}
        {!searching && tab === "discover" ? <div className="hub-welcome"><Search size={30} /><h3>O que vai tocar hoje?</h3><p>Pesquise uma música ou vídeo do YouTube, ou cole um link acima.</p><button className="quiet-button" onClick={() => setTab("drive")}><Cloud size={16} /> Abrir Google Drive</button></div> : null}
        {tab === "library" ? <><LibraryView items={libraryPage.items} filter={libraryFilter} query={libraryQuery} onQuery={setLibraryQuery} onFilter={setLibraryFilter} favorites={favoriteKeys} playlists={hub.playlists} onAdd={add} onPlayNext={playNext} onFavorite={toggleFavorite} onRemove={removeLibrary} onPlaylist={setPlaylistTarget} onSearch={() => { setTab("discover"); document.getElementById("media-search")?.focus(); }} />{libraryLoading ? <p role="status">Carregando biblioteca…</p> : null}{libraryPage.nextCursor !== null ? <button className="load-more" disabled={libraryLoading} onClick={() => void loadMoreLibrary()}>Carregar mais ({libraryPage.items.length} de {libraryPage.total})</button> : null}</> : null}
        {tab === "playlists" ? <PlaylistsView roomId={roomId} request={request} playlists={hub.playlists} selected={selectedPlaylist} onSelect={openPlaylist} onSelected={setSelectedPlaylist} onRefresh={refresh} onNotify={notify} onError={setMessage} onQueue={queuePlaylist} onDelete={() => setConfirmDelete(true)} /> : null}
        {tab === "history" ? <><HistoryView items={historyPage.items} playlists={hub.playlists} favorites={favoriteKeys} savedKeys={savedKeys} onAdd={add} onPlayNext={playNext} onFavorite={toggleFavorite} onSave={saveLibrary} onPlaylist={setPlaylistTarget} />{historyLoading ? <p role="status">Carregando histórico…</p> : null}{historyPage.nextCursor !== null ? <button className="load-more" disabled={historyLoading} onClick={() => void loadMoreHistory()}>Carregar mais ({historyPage.items.length} de {historyPage.total})</button> : null}</> : null}
        {tab === "drive" ? driveStatusLoading ? <div className="hub-loading" role="status">Consultando Google Drive…</div> : <DriveExplorer status={drive} request={request} onRefresh={async () => { await refresh(); setDrive(await request<DriveStatus>("/api/google-drive/status")); }} onAdd={add} onPlayNext={playNext} onSave={saveLibrary} onFavorite={toggleFavorite} onPlaylist={setPlaylistTarget} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={hub.playlists} onError={setMessage} /> : null}
      </div>
      {playlistTarget ? <PlaylistPicker playlists={hub.playlists} item={playlistTarget} roomId={roomId} request={request} onAdd={addToPlaylist} onCreated={async (playlist) => { await addToPlaylist(playlist.id, playlistTarget); }} onClose={() => setPlaylistTarget(null)} /> : null}
      {confirmDelete && selectedPlaylist ? <ConfirmDialog nested title={`Excluir “${selectedPlaylist.name}”?`} description="A playlist será removida, mas as mídias continuarão na biblioteca." confirmLabel="Excluir playlist" onClose={() => setConfirmDelete(false)} onConfirm={async () => { await request(`/api/media-hub/${roomId}/playlists/${selectedPlaylist.id}`, { method: "DELETE" }); setSelectedPlaylist(null); notify("Playlist excluída."); await refresh(); }} /> : null}
    </div>
  </div></MediaActionsContext.Provider>;
}

function SearchView({ query, remote, busy, searchState, nextPageToken, savedKeys, favoriteKeys, playlists, onAdd, onPlayNext, onSave, onFavorite, onPlaylist, onMore }: { query: string; remote: MediaSearchResult[]; busy: boolean; searchState: "idle" | "loading" | "ready" | "empty" | "error"; nextPageToken?: string; savedKeys: Set<string>; favoriteKeys: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onSave: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onMore: () => void }) {
  return <div className="hub-search-view">{remote.length ? <MediaList title="Resultados do YouTube" items={remote.map((item) => ({ ...item, creator: item.channel ?? String(item.metadata?.channelTitle ?? "YouTube") }))} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onSave={onSave} onFavorite={onFavorite} onPlaylist={onPlaylist} /> : null}{busy && !remote.length ? <div className="hub-loading" role="status">Buscando vídeos reproduzíveis…</div> : null}{searchState === "empty" ? <div className="hub-empty"><Search /><h3>Nenhum resultado para “{query}”</h3><p>Tente outro termo ou cole um link do YouTube.</p></div> : null}{nextPageToken ? <button className="load-more" onClick={onMore} disabled={busy}>{busy ? "Carregando…" : "Carregar mais"}</button> : null}</div>;
}


function LibraryView({ items, filter, query, onQuery, onFilter, favorites, playlists, onAdd, onPlayNext, onFavorite, onRemove, onPlaylist, onSearch }: { items: HouseLibraryItem[]; filter: string; query: string; onQuery: (query: string) => void; onFilter: (filter: string) => void; favorites: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onRemove: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onSearch: () => void }) {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = items.filter((item) => (filter === "all" || filter === "favorites" && item.favorite || filter === item.type || filter === item.provider) && (!normalized || `${item.title} ${item.creator ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized)));
  return <section className="hub-section"><div className="hub-section-title hub-section-tools"><div><h3>Biblioteca da Casa</h3><span>{items.length} itens carregados</span></div><select aria-label="Filtrar biblioteca" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">Todos</option><option value="favorites">Favoritos</option><option value="video">Vídeos</option><option value="audio">Música</option><option value="youtube">YouTube</option><option value="google-drive">Google Drive</option></select></div><label className="sr-only" htmlFor="library-search">Pesquisar na biblioteca</label><input id="library-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Pesquisar na biblioteca da Casa…" />{filtered.length ? <MediaList items={filtered} savedKeys={new Set(items.map(keyOf))} favoriteKeys={favorites} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onFavorite={onFavorite} onPlaylist={onPlaylist} onRemove={onRemove} /> : <div className="hub-empty compact"><BookOpen /><h3>{query || filter !== "all" ? "Nenhum item encontrado" : "Sua biblioteca ainda está vazia"}</h3><p>Salve algo que vocês querem ver ou ouvir novamente.</p><button onClick={onSearch}>Pesquisar mídia</button></div>}</section>;
}

function HistoryView({ items, playlists, favorites, savedKeys, onAdd, onPlayNext, onFavorite, onSave, onPlaylist }: { items: HouseHistoryEntry[]; playlists: Playlist[]; favorites: Set<string>; savedKeys: Set<string>; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onSave: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void }) {
  if (!items.length) return <div className="hub-empty"><History /><h3>Nada foi reproduzido por aqui ainda</h3><p>Quando uma mídia começar, ela aparecerá neste histórico da Casa.</p></div>;
  return <section className="hub-section"><div className="hub-section-title"><h3>Histórico da Casa</h3><span>Mais recentes primeiro</span></div><MediaList items={items} savedKeys={savedKeys} favoriteKeys={favorites} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onFavorite={onFavorite} onSave={onSave} onPlaylist={onPlaylist} showDate /></section>;
}

function MediaList({ title, items, savedKeys, favoriteKeys, playlists, onAdd, onPlayNext, onSave, onFavorite, onPlaylist, onRemove, showDate = false }: { title?: string; items: MediaItem[]; savedKeys: Set<string>; favoriteKeys: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onSave?: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onRemove?: (item: MediaItem) => void; showDate?: boolean }) {
  const access = useContext(MediaActionsContext);
  return <section className="media-list-section">
    {title ? <div className="hub-section-title"><h3>{title}</h3><span>{items.length} resultados</span></div> : null}
    <div className="media-list">{items.map((item) => {
      const saved = savedKeys.has(keyOf(item)); const favorite = favoriteKeys.has(keyOf(item)); const playedAt = "playedAt" in item ? String(item.playedAt) : ""; const available = item.available !== false;
      const hasMenuActions = access.canAdd && available || access.canSave || access.canEditPlaylist;
      return <article className="media-row" key={("playedAt" in item ? `${item.id}:${playedAt}` : keyOf(item))}>
        <MediaThumbnail item={item} />
        <div className="media-row-copy"><strong title={item.title}>{item.title}</strong><span>{item.creator ?? String(item.metadata?.channelTitle ?? providerLabel(item.provider))} · {formatDuration(item.duration)}</span><small>{providerLabel(item.provider)}{!available ? " · indisponível" : ""}</small>{showDate && playedAt ? <small>{dateLabel(playedAt)}</small> : null}</div>
        {access.canAdd && available ? <button className="media-row-primary" onClick={() => onAdd(item, false)}><Plus size={16} /> Fila</button> : <span />}
        {hasMenuActions ? <details className="media-actions"><summary aria-label={`Mais ações para ${item.title}`}><MoreHorizontal /></summary><div>
          {access.canAdd && access.canControl && available ? <button aria-label={`Reproduzir ${item.title} agora`} onClick={() => onAdd(item, true)}><Play /> Reproduzir agora</button> : null}
          {access.canAdd && available ? <button aria-label={`Reproduzir ${item.title} a seguir`} onClick={() => onPlayNext(item)}><ListMusic /> Reproduzir a seguir</button> : null}
          {access.canSave && !saved && onSave ? <button aria-label={`Salvar ${item.title} na biblioteca`} onClick={() => onSave(item)}><Save /> Salvar na biblioteca</button> : null}
          {access.canSave ? <button aria-label={`${favorite ? "Desfavoritar" : "Favoritar"} ${item.title}`} onClick={() => onFavorite(item)}><Heart fill={favorite ? "currentColor" : "none"} /> {favorite ? "Desfavoritar" : "Favoritar"}</button> : null}
          {access.canEditPlaylist ? <button aria-label={`Adicionar ${item.title} à playlist`} onClick={() => onPlaylist(item)}><Plus /> Adicionar à playlist</button> : null}
          {access.canSave && onRemove ? <button className="danger" aria-label={`Remover ${item.title} da biblioteca`} onClick={() => onRemove(item)}><Trash2 /> Remover da biblioteca</button> : null}
        </div></details> : <span />}
      </article>;
    })}</div>
  </section>;
}

function MediaThumbnail({ item, className = "media-row-thumb" }: { item: MediaItem; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <div className={className}>{item.thumbnail && failedUrl !== item.thumbnail ? <img src={item.thumbnail} alt="" width="160" height="90" loading="lazy" onError={() => setFailedUrl(item.thumbnail)} /> : item.provider === "google-drive" ? <Cloud aria-hidden="true" /> : <Play aria-hidden="true" />}</div>;
}


function PlaylistsView({ roomId, request, playlists, selected, onSelect, onSelected, onRefresh, onNotify, onError, onQueue, onDelete }: { roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; playlists: Playlist[]; selected: Playlist | null; onSelect: (playlist: Playlist) => void; onSelected: (playlist: Playlist | null) => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void; onError: (message: string) => void; onQueue: (playlist: Playlist, mode: QueueMode, playNow?: boolean) => void; onDelete: () => void }) {
  const access = useContext(MediaActionsContext);
  const [creating, setCreating] = useState(false); const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const create = async () => { if (!name.trim()) return; try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists`, { method: "POST", body: JSON.stringify({ name, description }) }); setName(""); setDescription(""); setCreating(false); onNotify("Playlist criada."); await onRefresh(); onSelected(data.playlist); } catch (error) { onError((error as Error).message); } };
  if (selected) return <PlaylistDetail roomId={roomId} request={request} playlist={selected} onBack={() => onSelected(null)} onChange={onSelected} onRefresh={onRefresh} onNotify={onNotify} onError={onError} onQueue={onQueue} onDelete={onDelete} />;
  return <section className="hub-section"><div className="hub-section-title"><div><h3>Playlists da Casa</h3><span>Coleções feitas em conjunto</span></div>{access.canCreatePlaylist ? <button onClick={() => setCreating(true)}><Plus size={16} /> Nova playlist</button> : null}</div>{creating ? <div className="playlist-form"><label>Nome<input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Noite de Rock" /></label><label>Descrição <span>opcional</span><textarea maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Para a próxima noite juntos" /></label><div><button className="quiet-button" onClick={() => setCreating(false)}>Cancelar</button><button onClick={() => void create()} disabled={!name.trim()}>Criar</button></div></div> : null}{playlists.length ? <div className="playlist-grid large">{playlists.map((playlist) => <button className="playlist-card" key={playlist.id} onClick={() => onSelect(playlist)}><ListMusic /><strong>{playlist.name}</strong><span>{playlist.itemCount} {playlist.itemCount === 1 ? "item" : "itens"} · por {playlist.createdBy.displayName}</span>{playlist.description ? <small>{playlist.description}</small> : null}</button>)}</div> : !creating ? <div className="hub-empty"><ListMusic /><h3>Nenhuma playlist ainda</h3><p>Crie uma para montar a próxima noite.</p>{access.canCreatePlaylist ? <button onClick={() => setCreating(true)}>Nova playlist</button> : null}</div> : null}</section>;
}

function PlaylistDetail({ roomId, request, playlist, onBack, onChange, onRefresh, onNotify, onError, onQueue, onDelete }: { roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; playlist: Playlist; onBack: () => void; onChange: (playlist: Playlist) => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void; onError: (message: string) => void; onQueue: (playlist: Playlist, mode: QueueMode, playNow?: boolean) => void; onDelete: () => void }) {
  const access = useContext(MediaActionsContext);
  const items = playlist.items ?? []; const [editing, setEditing] = useState(false); const [name, setName] = useState(playlist.name); const [description, setDescription] = useState(playlist.description ?? ""); const [dragged, setDragged] = useState<string | null>(null); const [confirmReplace, setConfirmReplace] = useState(false);
  const save = async () => { try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ name, description }) }); onChange(data.playlist); setEditing(false); onNotify("Playlist atualizada."); await onRefresh(); } catch (error) { onError((error as Error).message); } };
  const reorder = async (itemId: string, toIndex: number) => { const from = items.findIndex((item) => item.itemId === itemId); if (from < 0 || from === toIndex) return; const ordered = [...items]; const [item] = ordered.splice(from, 1); ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, item); onChange({ ...playlist, items: ordered.map((entry, position) => ({ ...entry, position })) }); try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}/order`, { method: "PUT", body: JSON.stringify({ itemIds: ordered.map((entry) => entry.itemId), expectedUpdatedAt: playlist.updatedAt }) }); onChange(data.playlist); } catch (error) { void request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}`).then((data) => onChange(data.playlist)).catch(() => onChange(playlist)); onError((error as Error).message); } };
  const remove = async (itemId: string) => { try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}/items/${itemId}`, { method: "DELETE" }); onChange(data.playlist); onNotify("Removido da playlist."); } catch (error) { onError((error as Error).message); } };
  return <section className="playlist-detail"><button className="back-link" onClick={onBack}>← Todas as playlists</button><header>{editing ? <div className="playlist-edit-fields"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><textarea value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} /><div><button onClick={() => setEditing(false)}>Cancelar</button><button onClick={() => void save()}>Salvar</button></div></div> : <div><h3>{playlist.name}</h3><p>{playlist.description || `${items.length} itens · criada por ${playlist.createdBy.displayName}`}</p></div>}<div className="playlist-detail-actions"><button onClick={() => onQueue(playlist, "next", true)} disabled={!items.length || !access.canAdd || !access.canControl}><Play size={16} /> Reproduzir</button><button onClick={() => onQueue(playlist, "append")} disabled={!items.length || !access.canAdd}><Plus size={16} /> Adicionar à fila</button><details className="media-actions"><summary aria-label="Mais opções"><MoreHorizontal /></summary><div><button onClick={() => onQueue(playlist, "next")} disabled={!access.canAdd}>Reproduzir a seguir</button><button onClick={() => setConfirmReplace(true)} disabled={!access.canControl || !access.canAdd}>Substituir fila</button><button onClick={() => setEditing(true)} disabled={!access.canEditPlaylist}>Editar detalhes</button><button className="danger" onClick={onDelete} disabled={!access.canDeletePlaylist}>Excluir playlist</button></div></details></div></header>{items.length ? <ol className="playlist-items">{items.map((item, index) => <li key={item.itemId} draggable={access.canEditPlaylist} onDragStart={() => setDragged(item.itemId)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void reorder(dragged, index); setDragged(null); }}><span className="playlist-position">{index + 1}</span><MediaThumbnail item={item} className="playlist-thumb" /><div><strong>{item.title}</strong><span>{item.creator ?? providerLabel(item.provider)} · {formatDuration(item.duration)}</span></div><button onClick={() => void reorder(item.itemId, index - 1)} disabled={index === 0 || !access.canEditPlaylist} aria-label="Mover para cima"><ChevronUp /></button><button onClick={() => void reorder(item.itemId, index + 1)} disabled={index === items.length - 1 || !access.canEditPlaylist} aria-label="Mover para baixo"><ChevronDown /></button><button className="danger" onClick={() => void remove(item.itemId)} aria-label={`Remover ${item.title}`} disabled={!access.canEditPlaylist}><Trash2 /></button></li>)}</ol> : <div className="hub-empty compact"><p>Esta playlist ainda está vazia. Adicione uma mídia pelo menu de ações.</p></div>}{confirmReplace ? <ConfirmDialog nested title="Substituir os próximos itens?" description="A mídia atual não será interrompida. A playlist substituirá o restante da fila para todos." confirmLabel="Substituir fila" onClose={() => setConfirmReplace(false)} onConfirm={() => { onQueue(playlist, "replace"); }} /> : null}</section>;
}

function PlaylistPicker({ playlists, item, roomId, request, onAdd, onCreated, onClose }: { playlists: Playlist[]; item: MediaItem; roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; onAdd: (playlistId: string, item: MediaItem) => void; onCreated: (playlist: Playlist) => void; onClose: () => void }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState("");
  const [error, setError] = useState("");
  const create = async () => { if (!name.trim()) return; try { setError(""); const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists`, { method: "POST", body: JSON.stringify({ name }) }); onCreated(data.playlist); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a playlist."); } };
  return <div className="nested-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="nested-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title"><header><div><span className="eyebrow">Adicionar à playlist</span><h3 id="playlist-picker-title">{item.title}</h3></div><button onClick={onClose} aria-label="Fechar"><X /></button></header>{error ? <p role="alert">{error}</p> : null}{playlists.map((playlist) => <button className="playlist-pick" key={playlist.id} onClick={() => onAdd(playlist.id, item)}><ListMusic /><span><strong>{playlist.name}</strong><small>{playlist.itemCount} itens</small></span><Plus /></button>)}{creating ? <form onSubmit={(event) => { event.preventDefault(); void create(); }}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da playlist" /><button disabled={!name.trim()}>Criar e adicionar</button></form> : <button className="playlist-pick new" onClick={() => setCreating(true)}><Plus /> Nova playlist</button>}</section></div>;
}

type DrivePage = { entries: DriveEntry[]; nextPageToken?: string };
type DriveEntry = { id: string; name: string; kind: "folder" | "video"; item?: MediaItem; mimeType?: string; size?: string };
const sortDriveEntries = (entries: DriveEntry[]) => entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, "pt-BR", { numeric: true }) : a.kind === "folder" ? -1 : 1);

function DriveExplorer({ status, request, onRefresh, onAdd, onPlayNext, onSave, onFavorite, onPlaylist, savedKeys, favoriteKeys, playlists, onError }: { status: DriveStatus; request: <T>(path: string, init?: RequestInit) => Promise<T>; onRefresh: () => Promise<void>; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onSave: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; savedKeys: Set<string>; favoriteKeys: Set<string>; playlists: Playlist[]; onError: (message: string) => void }) {
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([{ id: "root", name: "Meu Drive" }]);
  const [page, setPage] = useState<DrivePage>({ entries: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, { page: DrivePage; expiresAt: number }>());
  const requestId = useRef(0);
  const folderId = path[path.length - 1].id;
  const load = useCallback(async (id: string, next?: string, force = false) => {
    const generation = ++requestId.current;
    const cached = !next && !force ? cache.current.get(id) : undefined;
    if (cached && cached.expiresAt > Date.now()) { setPage(cached.page); setError(""); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ folderId: id }); if (next) params.set("pageToken", next);
      const result = await request<DrivePage>(`/api/google-drive/files?${params}`);
      if (generation !== requestId.current) return;
      const combined = { entries: sortDriveEntries(next ? [...page.entries, ...result.entries] : result.entries), nextPageToken: result.nextPageToken };
      cache.current.set(id, { page: combined, expiresAt: Date.now() + 60_000 });
      setPage(combined);
    } catch (cause) {
      if (generation === requestId.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar esta pasta.");
    } finally { if (generation === requestId.current) setLoading(false); }
  }, [page.entries, request]);
  useEffect(() => { if (status.connected) void load(folderId); }, [folderId, status.connected]);
  const navigate = (index: number) => { requestId.current += 1; setPage({ entries: [] }); setPath(path.slice(0, index + 1)); };
  const openFolder = (entry: DriveEntry) => { requestId.current += 1; setPage({ entries: [] }); setPath((current) => [...current, { id: entry.id, name: entry.name }]); };
  const connect = async () => {
    const popup = window.open("", "lumio-google-drive", "popup,width=560,height=720");
    try { const data = await request<{ url: string }>("/api/google-drive/auth/start", { method: "POST" }); if (popup) popup.location.href = data.url; else window.location.assign(data.url); }
    catch (cause) { popup?.close(); onError(cause instanceof Error ? cause.message : "Não foi possível conectar."); }
  };
  const disconnect = async () => {
    try { await request("/api/google-drive/disconnect", { method: "POST" }); cache.current.clear(); setPath([{ id: "root", name: "Meu Drive" }]); setPage({ entries: [] }); await onRefresh(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Não foi possível desconectar."); }
  };
  if (!status.configured) return <div className="drive-connect"><Cloud /><h3>Google Drive ainda não configurado</h3><p>Configure o OAuth e a chave de criptografia no servidor para conectar sua conta.</p></div>;
  if (!status.connected) return <div className="drive-connect"><Cloud /><h3>Seus vídeos do Drive, direto no Lumio</h3><p>Conecte sua conta para navegar por pastas e vídeos sem sair da Party.</p><button onClick={() => void connect()}>Conectar Google Drive</button></div>;
  return <section className="drive-area">
    <div className="drive-account"><div><span className="eyebrow">Google Drive · Conectado</span><strong>{status.email ?? "Conta conectada"}</strong></div><button className="quiet-button" onClick={() => void disconnect()}>Desconectar</button></div>
    <nav className="drive-breadcrumbs" aria-label="Caminho no Meu Drive">{path.map((segment, index) => <span key={segment.id}>{index > 0 ? <span aria-hidden="true"> › </span> : null}<button onClick={() => navigate(index)} disabled={index === path.length - 1}>{segment.name}</button></span>)}</nav>
    <div className="drive-toolbar"><h3>{path[path.length - 1].name}</h3><button className="quiet-button" onClick={() => void load(folderId, undefined, true)} disabled={loading} aria-label="Atualizar pasta"><RefreshCw size={16} /> Atualizar</button></div>
    {loading && !page.entries.length ? <p className="drive-hint" role="status">Carregando pasta…</p> : null}
    {error ? <div className="hub-message" role="alert">{error}<button onClick={() => void load(folderId, undefined, true)}>Tentar novamente</button></div> : null}
    {!loading && !error && !page.entries.length ? <div className="hub-empty compact"><Folder /><h3>Nenhum vídeo nesta pasta</h3><p>Pastas e vídeos compatíveis aparecerão aqui.</p></div> : null}
    <div className="drive-entry-list">{page.entries.filter((entry) => entry.kind === "folder").map((entry) => <button className="drive-folder" key={entry.id} onClick={() => openFolder(entry)}><Folder size={21} /><span>{entry.name}</span><span aria-hidden="true">›</span></button>)}{page.entries.some((entry) => entry.kind === "video" && entry.item) ? <MediaList title="Vídeos desta pasta" items={page.entries.filter((entry) => entry.kind === "video" && entry.item).map((entry) => entry.item!)} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onSave={onSave} onFavorite={onFavorite} onPlaylist={onPlaylist} /> : null}</div>
    {page.nextPageToken ? <button className="load-more" onClick={() => void load(folderId, page.nextPageToken)} disabled={loading}>{loading ? "Carregando…" : "Carregar mais"}</button> : null}
  </section>;
}

const providerLabel = (provider: MediaItem["provider"]) => provider === "google-drive" ? "Google Drive" : provider === "youtube" ? "YouTube" : "Lumio";
const formatDuration = (value = 0) => {
  if (!value) return "Duração indisponível";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
