import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, Cloud, Heart, History, ListMusic, MoreHorizontal, Play, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import type { HouseHistoryEntry, HouseLibraryItem, MediaItem, MediaSearchResult, Playlist } from "@lumio/shared";
import { isDriveReference, resolveMediaInput, youtubeIdFromInput } from "../media/MediaResolver";

interface SearchPage { results?: MediaSearchResult[]; nextPageToken?: string; message?: string }
interface HubData {
  library: HouseLibraryItem[];
  libraryTotal: number;
  nextCursor: number | null;
  favorites: HouseLibraryItem[];
  recent: HouseHistoryEntry[];
  playlists: Playlist[];
  continueWatching: Array<{ item: MediaItem; position: number; updatedAt: string }>;
}
interface DriveStatus { configured: boolean; connected: boolean; email?: string }
type HubTab = "home" | "library" | "playlists" | "history";
type QueueMode = "append" | "next" | "replace";

const emptyHub: HubData = { library: [], libraryTotal: 0, nextCursor: null, favorites: [], recent: [], playlists: [], continueWatching: [] };
const keyOf = (item: Pick<MediaItem, "provider" | "providerMediaId">) => `${item.provider}:${item.providerMediaId}`;
const asMedia = (item: MediaItem): MediaItem => ({ id: item.id, provider: item.provider, providerMediaId: item.providerMediaId, type: item.type, title: item.title, thumbnail: item.thumbnail, duration: item.duration, mimeType: item.mimeType, metadata: item.metadata, creator: item.creator, canonicalUrl: item.canonicalUrl, available: item.available });

export function MediaHub({ apiUrl, token, roomId, queueLength, queueRevision, refreshSignal, onClose, onAdd, onPlayNext }: {
  apiUrl: string; token: string; roomId: string; queueLength: number; queueRevision: number; refreshSignal: number; onClose: () => void;
  onAdd: (item: MediaItem, playNow: boolean) => void;
  onPlayNext: (item: MediaItem) => void;
}) {
  const [tab, setTab] = useState<HubTab>("home");
  const [hub, setHub] = useState<HubData>(emptyHub);
  const [drive, setDrive] = useState<DriveStatus>({ configured: false, connected: false });
  const [showDrive, setShowDrive] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [driveResults, setDriveResults] = useState<MediaItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const feedbackTimer = useRef<number>();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const notify = useCallback((text: string) => { setFeedback(text); window.clearTimeout(feedbackTimer.current); feedbackTimer.current = window.setTimeout(() => setFeedback(""), 3200); }, []);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    const data = response.status === 204 ? undefined : await response.json().catch(() => undefined) as T & { message?: string };
    if (!response.ok) throw new Error(data?.message ?? "Não foi possível concluir esta ação."); return data as T;
  }, [apiUrl, headers]);

  const refresh = useCallback(async () => {
    try {
      const [hubData, driveData] = await Promise.all([request<HubData>(`/api/media-hub/${roomId}?limit=60`), request<DriveStatus>("/api/google-drive/status")]);
      setHub(hubData); setDrive(driveData);
      if (selectedPlaylist) { const detail = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${selectedPlaylist.id}`); setSelectedPlaylist(detail.playlist); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir o Media Hub."); }
  }, [request, roomId, selectedPlaylist?.id]);

  useEffect(() => { void refresh(); }, [refresh, refreshSignal]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") playlistTarget || confirmDelete ? (setPlaylistTarget(null), setConfirmDelete(false)) : onClose(); };
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "lumio:drive-connected") { void refresh(); setShowDrive(true); } };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("message", onMessage); dialogRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("message", onMessage); requestRef.current?.abort(); window.clearTimeout(feedbackTimer.current); };
  }, [confirmDelete, onClose, playlistTarget, refresh]);

  const localResults = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("pt-BR"); if (value.length < 2 || value.startsWith("http")) return [];
    return hub.library.filter((item) => `${item.title} ${item.creator ?? ""}`.toLocaleLowerCase("pt-BR").includes(value)).slice(0, 12);
  }, [hub.library, query]);

  const runYouTubeSearch = useCallback(async (value: string, pageToken?: string, append = false) => {
    const normalized = value.trim(); if (normalized.length < 3) return;
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller; setBusy(true); setMessage(""); setLastQuery(normalized);
    try {
      const params = new URLSearchParams({ q: normalized }); if (pageToken) params.set("pageToken", pageToken);
      const page = await request<SearchPage>(`/api/youtube/search?${params}`, { signal: controller.signal });
      setResults((current) => append ? [...current, ...(page.results ?? [])] : page.results ?? []); setNextPageToken(page.nextPageToken);
      if (!append && !page.results?.length) setMessage("Nenhum vídeo reproduzível foi encontrado.");
    } catch (error) { if ((error as Error).name !== "AbortError") setMessage(error instanceof Error ? error.message : "Não conseguimos pesquisar no YouTube agora."); }
    finally { if (requestRef.current === controller) setBusy(false); }
  }, [request]);

  useEffect(() => {
    const value = query.trim(); if (value.length < 3 || value.startsWith("http") || isDriveReference(value) || youtubeIdFromInput(value) || localResults.length) return;
    const timer = window.setTimeout(() => void runYouTubeSearch(value), 450); return () => window.clearTimeout(timer);
  }, [localResults.length, query, runYouTubeSearch]);

  const submitSearch = async () => {
    const value = query.trim(); if (!value) return;
    if (value.startsWith("http") || isDriveReference(value) || youtubeIdFromInput(value)) {
      setBusy(true); setMessage("");
      try { onAdd(await resolveMediaInput(value, { apiUrl, token }), false); notify("Mídia adicionada à fila."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir esta mídia."); }
      finally { setBusy(false); } return;
    }
    await runYouTubeSearch(value);
  };

  const add = (item: MediaItem, playNow: boolean) => { onAdd(asMedia(item), playNow); notify(playNow ? `Reproduzindo agora: ${item.title}` : `Adicionado à fila: ${item.title} · posição ${queueLength + 1}`); if (playNow) onClose(); };
  const playNext = (item: MediaItem) => { onPlayNext(asMedia(item)); notify(`A seguir: ${item.title}`); };
  const saveLibrary = async (item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/library`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); notify("Salvo na biblioteca da Casa."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const removeLibrary = async (item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/library`, { method: "DELETE", body: JSON.stringify({ item: asMedia(item) }) }); notify("Removido da biblioteca."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const toggleFavorite = async (item: MediaItem) => { try { const result = await request<{ active: boolean }>(`/api/media-hub/${roomId}/favorite`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); notify(result.active ? "Adicionado aos favoritos da Casa." : "Removido dos favoritos."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const openPlaylist = async (playlist: Playlist) => { setBusy(true); try { const detail = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}`); setSelectedPlaylist(detail.playlist); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const addToPlaylist = async (playlistId: string, item: MediaItem) => { try { await request(`/api/media-hub/${roomId}/playlists/${playlistId}/items`, { method: "POST", body: JSON.stringify({ item: asMedia(item) }) }); setPlaylistTarget(null); notify("Adicionado à playlist."); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const queuePlaylist = async (playlist: Playlist, mode: QueueMode, playNow = false) => { try { await request(`/api/media-hub/${roomId}/playlists/${playlist.id}/queue`, { method: "POST", body: JSON.stringify({ mode, playNow, revision: queueRevision }) }); notify(playNow ? `Reproduzindo ${playlist.name}.` : mode === "next" ? "Playlist colocada a seguir." : "Playlist adicionada à fila."); if (playNow) onClose(); } catch (error) { setMessage((error as Error).message); } };

  const favoriteKeys = useMemo(() => new Set(hub.favorites.map(keyOf)), [hub.favorites]);
  const savedKeys = useMemo(() => new Set(hub.library.map(keyOf)), [hub.library]);
  const searching = Boolean(query.trim());

  return <div className="hub-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="media-hub media-hub-v2" role="dialog" aria-modal="true" aria-labelledby="media-hub-title" tabIndex={-1} ref={dialogRef}>
      <header className="hub-header"><div><span className="eyebrow">Media Hub</span><h2 id="media-hub-title">A mídia da Casa</h2><p>Encontre, guarde e monte a fila da noite.</p></div><button className="dialog-close" onClick={onClose} aria-label="Fechar Media Hub"><X size={19} /></button></header>
      <form className="hub-search" onSubmit={(event) => { event.preventDefault(); void submitSearch(); }}><label className="sr-only" htmlFor="media-search">Pesquisar no YouTube ou colar URL</label><input id="media-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar no YouTube ou colar uma URL…" /><button type="submit" disabled={busy || !query.trim()}><Search size={17} /> {busy ? "Buscando…" : localResults.length ? "Buscar no YouTube" : "Buscar"}</button></form>
      {feedback ? <div className="hub-feedback" role="status" aria-live="polite"><Check size={17} />{feedback}</div> : null}
      {message ? <div className="hub-message" role="alert"><span>{message}</span>{lastQuery ? <button onClick={() => void runYouTubeSearch(lastQuery)}><RefreshCw size={15} /> Tentar novamente</button> : null}</div> : null}
      <nav className="hub-tabs" aria-label="Media Hub">{([['home','Início'],['library','Biblioteca'],['playlists','Playlists'],['history','Histórico']] as Array<[HubTab,string]>).map(([id, label]) => <button key={id} className={tab === id && !searching ? "active" : ""} onClick={() => { setTab(id); setQuery(""); setResults([]); }}>{label}</button>)}</nav>
      <div className="hub-content">
        {searching ? <SearchView query={query} local={localResults} remote={results} busy={busy} nextPageToken={nextPageToken} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={hub.playlists} onAdd={add} onPlayNext={playNext} onSave={saveLibrary} onFavorite={toggleFavorite} onPlaylist={setPlaylistTarget} onMore={() => void runYouTubeSearch(lastQuery, nextPageToken, true)} /> : null}
        {!searching && tab === "home" ? <HomeView hub={hub} showDrive={showDrive} drive={drive} driveResults={driveResults} busy={busy} onToggleDrive={() => setShowDrive((value) => !value)} onDriveResults={setDriveResults} request={request} notify={notify} setMessage={setMessage} onAdd={add} onOpenPlaylist={openPlaylist} onGoLibrary={() => setTab("library")} /> : null}
        {!searching && tab === "library" ? <LibraryView items={hub.library} filter={libraryFilter} onFilter={setLibraryFilter} favorites={favoriteKeys} playlists={hub.playlists} onAdd={add} onPlayNext={playNext} onFavorite={toggleFavorite} onRemove={removeLibrary} onPlaylist={setPlaylistTarget} onSearch={() => document.getElementById("media-search")?.focus()} /> : null}
        {!searching && tab === "playlists" ? <PlaylistsView roomId={roomId} request={request} playlists={hub.playlists} selected={selectedPlaylist} onSelect={openPlaylist} onSelected={setSelectedPlaylist} onRefresh={refresh} onNotify={notify} onError={setMessage} onQueue={queuePlaylist} onDelete={() => setConfirmDelete(true)} /> : null}
        {!searching && tab === "history" ? <HistoryView items={hub.recent} playlists={hub.playlists} favorites={favoriteKeys} onAdd={add} onPlayNext={playNext} onFavorite={toggleFavorite} onSave={saveLibrary} onPlaylist={setPlaylistTarget} /> : null}
      </div>
      {playlistTarget ? <PlaylistPicker playlists={hub.playlists} item={playlistTarget} roomId={roomId} request={request} onAdd={addToPlaylist} onCreated={async (playlist) => { await addToPlaylist(playlist.id, playlistTarget); }} onClose={() => setPlaylistTarget(null)} /> : null}
      {confirmDelete && selectedPlaylist ? <ConfirmDialog title={`Excluir “${selectedPlaylist.name}”?`} body="A playlist será removida, mas as mídias continuarão na biblioteca." confirm="Excluir playlist" onClose={() => setConfirmDelete(false)} onConfirm={async () => { try { await request(`/api/media-hub/${roomId}/playlists/${selectedPlaylist.id}`, { method: "DELETE" }); setConfirmDelete(false); setSelectedPlaylist(null); notify("Playlist excluída."); await refresh(); } catch (error) { setMessage((error as Error).message); } }} /> : null}
    </div>
  </div>;
}

function SearchView({ query, local, remote, busy, nextPageToken, savedKeys, favoriteKeys, playlists, onAdd, onPlayNext, onSave, onFavorite, onPlaylist, onMore }: { query: string; local: HouseLibraryItem[]; remote: MediaSearchResult[]; busy: boolean; nextPageToken?: string; savedKeys: Set<string>; favoriteKeys: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onSave: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onMore: () => void }) {
  return <div className="hub-search-view">{local.length ? <MediaList title="Na biblioteca" items={local} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onSave={onSave} onFavorite={onFavorite} onPlaylist={onPlaylist} /> : null}{remote.length ? <MediaList title="Resultados do YouTube" items={remote.map((item) => ({ ...item, creator: item.channel ?? String(item.metadata?.channelTitle ?? "YouTube") }))} savedKeys={savedKeys} favoriteKeys={favoriteKeys} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onSave={onSave} onFavorite={onFavorite} onPlaylist={onPlaylist} /> : null}{busy && !remote.length ? <div className="hub-loading" aria-live="polite">Buscando vídeos reproduzíveis…</div> : null}{!busy && !local.length && !remote.length ? <div className="hub-empty"><Search /><h3>Buscando por “{query}”</h3><p>Os resultados do YouTube aparecerão aqui.</p></div> : null}{nextPageToken ? <button className="load-more" onClick={onMore} disabled={busy}>{busy ? "Carregando…" : "Carregar mais"}</button> : null}</div>;
}

function HomeView({ hub, showDrive, drive, driveResults, busy, onToggleDrive, onDriveResults, request, notify, setMessage, onAdd, onOpenPlaylist, onGoLibrary }: { hub: HubData; showDrive: boolean; drive: DriveStatus; driveResults: MediaItem[]; busy: boolean; onToggleDrive: () => void; onDriveResults: (items: MediaItem[]) => void; request: <T>(path: string, init?: RequestInit) => Promise<T>; notify: (message: string) => void; setMessage: (message: string) => void; onAdd: (item: MediaItem, playNow: boolean) => void; onOpenPlaylist: (playlist: Playlist) => void; onGoLibrary: () => void }) {
  if (!hub.library.length && !hub.playlists.length && !hub.recent.length) return <div className="hub-welcome"><Search size={30} /><h3>O que vai tocar hoje?</h3><p>Pesquise uma música ou vídeo acima. Você pode guardar o que quiser rever.</p><button className="quiet-button" onClick={onToggleDrive}><Cloud size={16} /> {showDrive ? "Ocultar Drive" : "Abrir Google Drive"}</button>{showDrive ? <DrivePanel status={drive} items={driveResults} busy={busy} request={request} onResults={onDriveResults} onAdd={onAdd} notify={notify} setMessage={setMessage} /> : null}</div>;
  return <><div className="hub-home-actions"><button className="quiet-button" onClick={onToggleDrive}><Cloud size={16} /> Google Drive</button><button className="quiet-button" onClick={onGoLibrary}><BookOpen size={16} /> Ver biblioteca</button></div>{showDrive ? <DrivePanel status={drive} items={driveResults} busy={busy} request={request} onResults={onDriveResults} onAdd={onAdd} notify={notify} setMessage={setMessage} /> : null}{hub.playlists.length ? <section className="hub-section"><div className="hub-section-title"><h3>Playlists recentes</h3><span>{hub.playlists.length}</span></div><div className="playlist-grid">{hub.playlists.slice(0, 4).map((playlist) => <button className="playlist-card" key={playlist.id} onClick={() => onOpenPlaylist(playlist)}><ListMusic /><strong>{playlist.name}</strong><span>{playlist.itemCount} {playlist.itemCount === 1 ? "item" : "itens"}</span></button>)}</div></section> : null}{hub.library.length ? <MediaStrip title="Adicionados recentemente" items={hub.library.slice(0, 6)} onAdd={onAdd} /> : <MediaStrip title="Reproduzidos recentemente" items={hub.recent.slice(0, 6)} onAdd={onAdd} />}</>;
}

function LibraryView({ items, filter, onFilter, favorites, playlists, onAdd, onPlayNext, onFavorite, onRemove, onPlaylist, onSearch }: { items: HouseLibraryItem[]; filter: string; onFilter: (filter: string) => void; favorites: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onRemove: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onSearch: () => void }) {
  const filtered = items.filter((item) => filter === "all" || filter === "favorites" && item.favorite || filter === item.type || filter === item.provider);
  return <section className="hub-section"><div className="hub-section-title hub-section-tools"><div><h3>Biblioteca da Casa</h3><span>{items.length} itens guardados</span></div><select aria-label="Filtrar biblioteca" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">Todos</option><option value="favorites">Favoritos</option><option value="video">Vídeos</option><option value="audio">Música</option><option value="youtube">YouTube</option><option value="google-drive">Google Drive</option></select></div>{filtered.length ? <MediaList items={filtered} savedKeys={new Set(items.map(keyOf))} favoriteKeys={favorites} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onFavorite={onFavorite} onPlaylist={onPlaylist} onRemove={onRemove} /> : <div className="hub-empty compact"><BookOpen /><h3>Sua biblioteca ainda está vazia</h3><p>Salve algo que vocês querem ver ou ouvir novamente.</p><button onClick={onSearch}>Pesquisar mídia</button></div>}</section>;
}

function HistoryView({ items, playlists, favorites, onAdd, onPlayNext, onFavorite, onSave, onPlaylist }: { items: HouseHistoryEntry[]; playlists: Playlist[]; favorites: Set<string>; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onSave: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void }) {
  if (!items.length) return <div className="hub-empty"><History /><h3>Nada foi reproduzido por aqui ainda</h3><p>Quando uma mídia começar, ela aparecerá neste histórico da Casa.</p></div>;
  return <section className="hub-section"><div className="hub-section-title"><h3>Histórico da Casa</h3><span>Mais recentes primeiro</span></div><MediaList items={items} savedKeys={new Set()} favoriteKeys={favorites} playlists={playlists} onAdd={onAdd} onPlayNext={onPlayNext} onFavorite={onFavorite} onSave={onSave} onPlaylist={onPlaylist} showDate /></section>;
}

function MediaList({ title, items, savedKeys, favoriteKeys, playlists, onAdd, onPlayNext, onSave, onFavorite, onPlaylist, onRemove, showDate = false }: { title?: string; items: MediaItem[]; savedKeys: Set<string>; favoriteKeys: Set<string>; playlists: Playlist[]; onAdd: (item: MediaItem, playNow: boolean) => void; onPlayNext: (item: MediaItem) => void; onSave?: (item: MediaItem) => void; onFavorite: (item: MediaItem) => void; onPlaylist: (item: MediaItem) => void; onRemove?: (item: MediaItem) => void; showDate?: boolean }) {
  return <section className="media-list-section">{title ? <div className="hub-section-title"><h3>{title}</h3><span>{items.length} resultados</span></div> : null}<div className="media-list">{items.map((item) => { const saved = savedKeys.has(keyOf(item)); const favorite = favoriteKeys.has(keyOf(item)); const playedAt = "playedAt" in item ? String(item.playedAt) : ""; return <article className="media-row" key={("playedAt" in item ? `${item.id}:${playedAt}` : keyOf(item))}><div className="media-row-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" width="160" height="90" loading="lazy" /> : item.provider === "google-drive" ? <Cloud /> : <Play />}</div><div className="media-row-copy"><strong>{item.title}</strong><span>{item.creator ?? String(item.metadata?.channelTitle ?? providerLabel(item.provider))} · {formatDuration(item.duration)}</span>{showDate && playedAt ? <small>{dateLabel(playedAt)}</small> : null}</div><button className="media-row-primary" onClick={() => onAdd(item, false)}><Plus size={16} /> Fila</button><details className="media-actions"><summary aria-label={`Mais ações para ${item.title}`}><MoreHorizontal /></summary><div><button onClick={() => onAdd(item, true)}><Play /> Reproduzir agora</button><button onClick={() => onPlayNext(item)}><ListMusic /> Reproduzir a seguir</button>{!saved && onSave ? <button onClick={() => onSave(item)}><Save /> Salvar na biblioteca</button> : null}<button onClick={() => onFavorite(item)}><Heart fill={favorite ? "currentColor" : "none"} /> {favorite ? "Desfavoritar" : "Favoritar"}</button><button onClick={() => onPlaylist(item)} disabled={!playlists.length && false}><Plus /> Adicionar à playlist</button>{onRemove ? <button className="danger" onClick={() => onRemove(item)}><Trash2 /> Remover da biblioteca</button> : null}</div></details></article>; })}</div></section>;
}

function MediaStrip({ title, items, onAdd }: { title: string; items: MediaItem[]; onAdd: (item: MediaItem, playNow: boolean) => void }) { return <section className="hub-section"><div className="hub-section-title"><h3>{title}</h3><span>{items.length} itens</span></div><div className="media-grid">{items.map((item) => <article className="media-card" key={keyOf(item)}><button className="media-card-main" onClick={() => onAdd(item, false)}><div className="media-card-art">{item.thumbnail ? <img src={item.thumbnail} alt="" width="320" height="180" loading="lazy" /> : <Play />}</div><strong>{item.title}</strong><small>{providerLabel(item.provider)} · {formatDuration(item.duration)}</small></button><button className="play-now-card" onClick={() => onAdd(item, true)} aria-label={`Reproduzir ${item.title} agora`}><Play size={15} /></button></article>)}</div></section>; }

function PlaylistsView({ roomId, request, playlists, selected, onSelect, onSelected, onRefresh, onNotify, onError, onQueue, onDelete }: { roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; playlists: Playlist[]; selected: Playlist | null; onSelect: (playlist: Playlist) => void; onSelected: (playlist: Playlist | null) => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void; onError: (message: string) => void; onQueue: (playlist: Playlist, mode: QueueMode, playNow?: boolean) => void; onDelete: () => void }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const create = async () => { if (!name.trim()) return; try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists`, { method: "POST", body: JSON.stringify({ name, description }) }); setName(""); setDescription(""); setCreating(false); onNotify("Playlist criada."); await onRefresh(); onSelected(data.playlist); } catch (error) { onError((error as Error).message); } };
  if (selected) return <PlaylistDetail roomId={roomId} request={request} playlist={selected} onBack={() => onSelected(null)} onChange={onSelected} onRefresh={onRefresh} onNotify={onNotify} onError={onError} onQueue={onQueue} onDelete={onDelete} />;
  return <section className="hub-section"><div className="hub-section-title"><div><h3>Playlists da Casa</h3><span>Coleções feitas em conjunto</span></div><button onClick={() => setCreating(true)}><Plus size={16} /> Nova playlist</button></div>{creating ? <div className="playlist-form"><label>Nome<input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Noite de Rock" /></label><label>Descrição <span>opcional</span><textarea maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Para a próxima noite juntos" /></label><div><button className="quiet-button" onClick={() => setCreating(false)}>Cancelar</button><button onClick={() => void create()} disabled={!name.trim()}>Criar</button></div></div> : null}{playlists.length ? <div className="playlist-grid large">{playlists.map((playlist) => <button className="playlist-card" key={playlist.id} onClick={() => onSelect(playlist)}><ListMusic /><strong>{playlist.name}</strong><span>{playlist.itemCount} {playlist.itemCount === 1 ? "item" : "itens"} · por {playlist.createdBy.displayName}</span>{playlist.description ? <small>{playlist.description}</small> : null}</button>)}</div> : !creating ? <div className="hub-empty"><ListMusic /><h3>Nenhuma playlist ainda</h3><p>Crie uma para montar a próxima noite.</p><button onClick={() => setCreating(true)}>Nova playlist</button></div> : null}</section>;
}

function PlaylistDetail({ roomId, request, playlist, onBack, onChange, onRefresh, onNotify, onError, onQueue, onDelete }: { roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; playlist: Playlist; onBack: () => void; onChange: (playlist: Playlist) => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void; onError: (message: string) => void; onQueue: (playlist: Playlist, mode: QueueMode, playNow?: boolean) => void; onDelete: () => void }) {
  const items = playlist.items ?? []; const [editing, setEditing] = useState(false); const [name, setName] = useState(playlist.name); const [description, setDescription] = useState(playlist.description ?? ""); const [dragged, setDragged] = useState<string | null>(null); const [confirmReplace, setConfirmReplace] = useState(false);
  const save = async () => { try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ name, description }) }); onChange(data.playlist); setEditing(false); onNotify("Playlist atualizada."); await onRefresh(); } catch (error) { onError((error as Error).message); } };
  const reorder = async (itemId: string, toIndex: number) => { const from = items.findIndex((item) => item.itemId === itemId); if (from < 0 || from === toIndex) return; const ordered = [...items]; const [item] = ordered.splice(from, 1); ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, item); onChange({ ...playlist, items: ordered.map((entry, position) => ({ ...entry, position })) }); try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}/order`, { method: "PUT", body: JSON.stringify({ itemIds: ordered.map((entry) => entry.itemId) }) }); onChange(data.playlist); } catch (error) { onChange(playlist); onError((error as Error).message); } };
  const remove = async (itemId: string) => { try { const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists/${playlist.id}/items/${itemId}`, { method: "DELETE" }); onChange(data.playlist); onNotify("Removido da playlist."); } catch (error) { onError((error as Error).message); } };
  return <section className="playlist-detail"><button className="back-link" onClick={onBack}>← Todas as playlists</button><header>{editing ? <div className="playlist-edit-fields"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><textarea value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} /><div><button onClick={() => setEditing(false)}>Cancelar</button><button onClick={() => void save()}>Salvar</button></div></div> : <div><h3>{playlist.name}</h3><p>{playlist.description || `${items.length} itens · criada por ${playlist.createdBy.displayName}`}</p></div>}<div className="playlist-detail-actions"><button onClick={() => onQueue(playlist, "next", true)} disabled={!items.length}><Play size={16} /> Reproduzir</button><button onClick={() => onQueue(playlist, "append")} disabled={!items.length}><Plus size={16} /> Adicionar à fila</button><details className="media-actions"><summary aria-label="Mais opções"><MoreHorizontal /></summary><div><button onClick={() => onQueue(playlist, "next")}>Reproduzir a seguir</button><button onClick={() => setConfirmReplace(true)}>Substituir fila</button><button onClick={() => setEditing(true)}>Editar detalhes</button><button className="danger" onClick={onDelete}>Excluir playlist</button></div></details></div></header>{items.length ? <ol className="playlist-items">{items.map((item, index) => <li key={item.itemId} draggable onDragStart={() => setDragged(item.itemId)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void reorder(dragged, index); setDragged(null); }}><span className="playlist-position">{index + 1}</span><div className="playlist-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : <Play />}</div><div><strong>{item.title}</strong><span>{item.creator ?? providerLabel(item.provider)} · {formatDuration(item.duration)}</span></div><button onClick={() => void reorder(item.itemId, index - 1)} disabled={index === 0} aria-label="Mover para cima"><ChevronUp /></button><button onClick={() => void reorder(item.itemId, index + 1)} disabled={index === items.length - 1} aria-label="Mover para baixo"><ChevronDown /></button><button className="danger" onClick={() => void remove(item.itemId)} aria-label={`Remover ${item.title}`}><Trash2 /></button></li>)}</ol> : <div className="hub-empty compact"><p>Esta playlist ainda está vazia. Adicione uma mídia pelo menu de ações.</p></div>}{confirmReplace ? <ConfirmDialog title="Substituir os próximos itens?" body="A mídia atual não será interrompida. A playlist substituirá o restante da fila para todos." confirm="Substituir fila" onClose={() => setConfirmReplace(false)} onConfirm={() => { setConfirmReplace(false); onQueue(playlist, "replace"); }} /> : null}</section>;
}

function PlaylistPicker({ playlists, item, roomId, request, onAdd, onCreated, onClose }: { playlists: Playlist[]; item: MediaItem; roomId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>; onAdd: (playlistId: string, item: MediaItem) => void; onCreated: (playlist: Playlist) => void; onClose: () => void }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState("");
  const create = async () => { if (!name.trim()) return; const data = await request<{ playlist: Playlist }>(`/api/media-hub/${roomId}/playlists`, { method: "POST", body: JSON.stringify({ name }) }); onCreated(data.playlist); };
  return <div className="nested-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="nested-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title"><header><div><span className="eyebrow">Adicionar à playlist</span><h3 id="playlist-picker-title">{item.title}</h3></div><button onClick={onClose} aria-label="Fechar"><X /></button></header>{playlists.map((playlist) => <button className="playlist-pick" key={playlist.id} onClick={() => onAdd(playlist.id, item)}><ListMusic /><span><strong>{playlist.name}</strong><small>{playlist.itemCount} itens</small></span><Plus /></button>)}{creating ? <form onSubmit={(event) => { event.preventDefault(); void create(); }}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da playlist" /><button disabled={!name.trim()}>Criar e adicionar</button></form> : <button className="playlist-pick new" onClick={() => setCreating(true)}><Plus /> Nova playlist</button>}</section></div>;
}

function ConfirmDialog({ title, body, confirm, onClose, onConfirm }: { title: string; body: string; confirm: string; onClose: () => void; onConfirm: () => void }) { return <div className="nested-dialog-backdrop"><section className="nested-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h3 id="confirm-title">{title}</h3><p>{body}</p><div><button onClick={onClose}>Cancelar</button><button className="danger-action" onClick={onConfirm}>{confirm}</button></div></section></div>; }

function DrivePanel({ status, items, busy, request, onResults, onAdd, notify, setMessage }: { status: DriveStatus; items: MediaItem[]; busy: boolean; request: <T>(path: string, init?: RequestInit) => Promise<T>; onResults: (items: MediaItem[]) => void; onAdd: (item: MediaItem, playNow: boolean) => void; notify: (message: string) => void; setMessage: (message: string) => void }) {
  const connect = async () => { try { const data = await request<{ url: string }>("/api/google-drive/auth/start", { method: "POST" }); window.open(data.url, "lumio-google-drive", "popup,width=560,height=720"); } catch (error) { setMessage((error as Error).message); } };
  const explore = async () => { try { const data = await request<{ files: MediaItem[] }>("/api/google-drive/files"); onResults(data.files); } catch (error) { setMessage((error as Error).message); } };
  if (!status.configured) return <div className="drive-connect"><Cloud /><h3>Google Drive ainda não configurado</h3><p>Adicione as credenciais OAuth no arquivo <code>.env</code>.</p></div>;
  if (!status.connected) return <div className="drive-connect"><Cloud /><h3>Conecte seu Google Drive</h3><p>O Lumio acessa apenas arquivos que sua conta já pode abrir.</p><button onClick={() => void connect()}>Conectar Google Drive</button></div>;
  return <section className="drive-area"><div className="drive-account"><div><span className="eyebrow">Google Drive</span><strong>{status.email ?? "Conta conectada"}</strong></div><button onClick={() => void explore()} disabled={busy}>Explorar arquivos</button></div>{items.length ? <MediaStrip title="Arquivos reproduzíveis" items={items} onAdd={onAdd} /> : <p className="drive-hint">Abra seus arquivos para encontrar vídeos e áudios compatíveis.</p>}</section>;
}

const providerLabel = (provider: MediaItem["provider"]) => provider === "google-drive" ? "Google Drive" : provider === "youtube" ? "YouTube" : "Lumio";
const formatDuration = (value = 0) => value ? `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}` : "Duração indisponível";
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
