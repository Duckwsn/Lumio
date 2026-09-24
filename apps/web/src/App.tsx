import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity, ChevronDown, ChevronUp, Headphones, History, Library, ListVideo, LogOut,
  Maximize2, MessageCircle, Mic, MicOff, Plus, Send, Settings, Share2, SkipBack, SkipForward,
  SlidersHorizontal, Sparkles, Trash2, Users, Volume2, X, MonitorUp, ScreenShareOff,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import {
  eventNames,
  type ChatMessage,
  type ClientToServerEvents,
  type MediaItem,
  type QueueItem,
  type RoomSettings,
  type RoomSnapshot,
  type ServerToClientEvents,
  type User,
  type HouseDetails,
  type HouseMember,
  type HouseSummary,
  type HouseHistoryEntry,
  type VoicePeer,
} from "@lumio/shared";
import type { MainStageView } from "./components/MainStage";
import type { LocalAudioSettings } from "./components/CallSettings";
import { expectedPosition } from "./media/MediaProvider";
import { toQueueItem } from "./media/MediaResolver";
import { shouldIgnoreOffer } from "./rtc/negotiation";
import { HouseSettingsDialog, InviteDialog, ProfileDialog } from "./components/SocialDialogs";
import { Avatar } from "./components/Avatar";
import { LumioLogo } from "./components/LumioLogo";
import { AuthPage, BootstrapPage, EmailActionPage, HomePage, InvitePage, LandingPage } from "./components/EntryExperience";
import { PwaInstallAction } from "./components/PwaExperience";

const MediaHub = lazy(() => import("./components/MediaHub").then((module) => ({ default: module.MediaHub })));
const MediaStage = lazy(() => import("./components/MediaStage").then((module) => ({ default: module.MediaStage })));
const MainStage = lazy(() => import("./components/MainStage").then((module) => ({ default: module.MainStage })));
const CallSettings = lazy(() => import("./components/CallSettings").then((module) => ({ default: module.CallSettings })));
const AccountPage = lazy(() => import("./components/AccountPage").then((module) => ({ default: module.AccountPage })));

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_URL;
const SESSION_KEY = "lumio.session.v1";
const HOUSE_KEY = "lumio.house.v1";
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SessionData { user: User; token: string }

const avatarLetters = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const timeLabel = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const formatDuration = (value = 0) => value >= 3600
  ? `${Math.floor(value / 3600)}:${Math.floor(value % 3600 / 60).toString().padStart(2, "0")}:${Math.floor(value % 60).toString().padStart(2, "0")}`
  : `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
const providerLabel = (provider: QueueItem["provider"]) => provider === "google-drive" ? "Google Drive" : provider === "youtube" ? "YouTube" : "Lumio";
const isEditableTarget = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node?.isContentEditable || node?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], button, [role="slider"]')); };
const safeAuthDestination = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && !["/login", "/register", "/"].includes(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : "/app"; }
  catch { return "/app"; }
};

export function App() {
  const [session, setSession] = useState<SessionData | null>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as SessionData | null; } catch { return null; }
  });
  const [authStatus, setAuthStatus] = useState<"unknown" | "authenticated" | "unauthenticated">(() => localStorage.getItem(SESSION_KEY) ? "unknown" : "unauthenticated");
  const [path, setPath] = useState(() => `${window.location.pathname}${window.location.search}`);
  const [bootstrapError, setBootstrapError] = useState("");
  const [housesError, setHousesError] = useState("");
  const [houses, setHouses] = useState<HouseSummary[]>([]);
  const [house, setHouse] = useState<HouseDetails | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "offline" | "error">("connecting");
  const [entryError, setEntryError] = useState("");
  const [partyNotice, setPartyNotice] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [authError, setAuthError] = useState("");
  const [reaction, setReaction] = useState<{ id: string; emoji: string; user: User } | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [callState, setCallState] = useState<"idle" | "joining" | "connected" | "reconnecting" | "leaving" | "error">("idle");
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "members" | "queue">("members");
  const [showMediaHub, setShowMediaHub] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showHouseSettings, setShowHouseSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);
  const [ambientMode, setAmbientMode] = useState(true);
  const [presentationMode, setPresentationMode] = useState<"video" | "music">(() => localStorage.getItem("lumio.presentation.v1") === "music" ? "music" : "video");
  const [mediaHubRevision, setMediaHubRevision] = useState(0);
  const [confirmClearQueue, setConfirmClearQueue] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [playerResyncToken, setPlayerResyncToken] = useState(0);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [showCallSettings, setShowCallSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioSettings, setAudioSettings] = useState<LocalAudioSettings>(() => {
    const defaults: LocalAudioSettings = { inputDeviceId: "", outputDeviceId: "", microphoneMode: "voice", mediaVolume: 100, callVolume: 100, duckingEnabled: true, duckingVolume: 40 };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem("lumio.audio.v1") ?? "{}") }; } catch { return defaults; }
  });
  const [micLevel, setMicLevel] = useState(0);
  const [stageView, setStageView] = useState<MainStageView>("media");
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [callQuality, setCallQuality] = useState<"Calculando" | "Excelente" | "Boa" | "Instável">("Calculando");
  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef(new Map<string, RTCPeerConnection>());
  const peerSessions = useRef(new Map<string, { socketId: string; polite: boolean; makingOffer: boolean; ignoreOffer: boolean; settingAnswer: boolean; candidates: RTCIceCandidateInit[]; restartAttempts: number; restartTimer?: number; disconnectTimer?: number }>());
  const rtcConfiguration = useRef<RTCConfiguration>({ iceServers: [] });
  const callActiveRef = useRef(false);
  const callGeneration = useRef(0);
  const micRequestInFlight = useRef(false);
  const resetPeers = useRef<() => void>(() => undefined);
  const joinCallRef = useRef<(withMic: boolean, deviceOverride?: string) => Promise<void>>(async () => undefined);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const analyserCleanup = useRef<(() => void) | null>(null);
  const displayStream = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  const deafenedRef = useRef(deafened);
  const audioSettingsRef = useRef(audioSettings);
  const participantVolumesRef = useRef(participantVolumes);
  const partyNoticeTimer = useRef<number>();
  const offlineTimer = useRef<number>();
  const hadSnapshot = useRef(false);
  const reconnecting = useRef(false);
  const membersSeen = useRef(new Map<string, string>());
  const queueSeen = useRef(new Set<string>());
  const latestMedia = useRef<RoomSnapshot["currentMedia"] | null>(null);
  const screenShareActor = useRef<{ id: string; name: string } | null>(null);
  const feedbackRevision = useRef(-1);
  const houseRequestVersion = useRef(0);
  const drawerStateRef = useRef({ open: false, panel: "members" as "chat" | "members" | "queue" });
  const drawerReturnFocus = useRef<HTMLElement | null>(null);
  const shortcutActions = useRef<{ toggleDeafen?: () => void; toggleTheater?: () => void; closeTop?: () => void }>({});
  const pathname = path.split("?")[0];
  const routeHouseId = pathname.startsWith("/house/") ? decodeURIComponent(pathname.slice(7)) : "";
  const inviteToken = pathname.startsWith("/invite/") ? decodeURIComponent(pathname.slice(8)) : "";
  const navigate = useCallback((next: string) => { window.history.pushState({}, "", next); setPath(next); window.scrollTo(0, 0); }, []);

  useEffect(() => { const onPopState = () => setPath(`${window.location.pathname}${window.location.search}`); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  const bootstrap = useCallback(async () => {
    if (!session) { setAuthStatus("unauthenticated"); return; } setBootstrapError("");
    try { const response = await fetch(`${API_URL}/api/bootstrap`, { headers: { Authorization: `Bearer ${session.token}` } }); if (response.status === 401) { localStorage.removeItem(SESSION_KEY); setSession(null); setHouses([]); setAuthStatus("unauthenticated"); if (pathname !== "/" && !pathname.startsWith("/invite/")) navigate(`/login?next=${encodeURIComponent(path)}`); return; } if (!response.ok) throw new Error(); const data = await response.json() as { user: User; houses: HouseSummary[] }; const nextSession = { ...session, user: data.user }; localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession)); setSession(nextSession); setHouses(data.houses); setAuthStatus("authenticated"); }
    catch { setBootstrapError("Não foi possível conectar ao Lumio."); }
  }, [session?.token]);
  useEffect(() => { if (authStatus === "unknown") void bootstrap(); }, [authStatus, bootstrap]);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { deafenedRef.current = deafened; }, [deafened]);
  useEffect(() => { audioSettingsRef.current = audioSettings; }, [audioSettings]);
  useEffect(() => { participantVolumesRef.current = participantVolumes; }, [participantVolumes]);
  useEffect(() => { if (window.matchMedia("(pointer: coarse)").matches) setAudioSettings((current) => current.microphoneMode === "ptt" ? { ...current, microphoneMode: "voice" } : current); }, []);
  drawerStateRef.current = { open: !rightPanelCollapsed, panel: activePanel };
  useEffect(() => { if (!rightPanelCollapsed && activePanel === "chat") setUnreadChat(0); }, [rightPanelCollapsed, activePanel]);
  const notifyParty = useCallback((message: string, tone: "info" | "success" | "error" = "info") => {
    window.clearTimeout(partyNoticeTimer.current);
    setPartyNotice({ message, tone });
    partyNoticeTimer.current = window.setTimeout(() => setPartyNotice(null), tone === "error" ? 6000 : 3200);
  }, []);
  const rejectCall = useCallback((message: string) => {
    callGeneration.current += 1; callActiveRef.current = false; micRequestInFlight.current = false; resetPeers.current();
    localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
    displayStream.current?.getTracks().forEach((track) => track.stop()); displayStream.current = null;
    analyserCleanup.current?.(); analyserCleanup.current = null;
    setMicEnabled(false); setLocalScreenStream(null); setRemoteScreenStream(null); setVoiceError(message); setCallState("error");
  }, []);
  useEffect(() => () => { window.clearTimeout(partyNoticeTimer.current); window.clearTimeout(offlineTimer.current); }, []);
  useEffect(() => { localStorage.setItem("lumio.audio.v1", JSON.stringify(audioSettings)); }, [audioSettings]);
  useEffect(() => { localStorage.setItem("lumio.presentation.v1", presentationMode); }, [presentationMode]);

  const authHeaders = session ? { Authorization: `Bearer ${session.token}` } : undefined;
  const refreshHouses = useCallback(async () => {
    if (!session) return;
    const version = ++houseRequestVersion.current;
    setHousesError("");
    let response: Response; try { response = await fetch(`${API_URL}/api/houses`, { headers: authHeaders }); } catch { if (version === houseRequestVersion.current) setHousesError("Não foi possível carregar suas Casas."); return; }
    if (version !== houseRequestVersion.current) return;
    if (response.status === 401) { localStorage.removeItem(SESSION_KEY); setSession(null); setSnapshot(null); setAuthStatus("unauthenticated"); return; } if (!response.ok) { setHousesError("Não foi possível carregar suas Casas."); return; }
    const data = await response.json() as { houses: HouseSummary[] }; if (version === houseRequestVersion.current) setHouses(data.houses);
  }, [session?.token]);
  useEffect(() => { if (authStatus === "authenticated") void refreshHouses(); }, [authStatus, refreshHouses]);
  useEffect(() => { if (authStatus !== "authenticated" || routeHouseId || inviteToken) return; const timer = window.setInterval(() => void refreshHouses(), 20_000); return () => window.clearInterval(timer); }, [authStatus, routeHouseId, inviteToken, refreshHouses]);

  useEffect(() => { if (routeHouseId) localStorage.setItem(HOUSE_KEY, routeHouseId); }, [routeHouseId]);

  const selectedHouse = houses.find((item) => item.id === routeHouseId);
  useEffect(() => {
    if (authStatus !== "authenticated" || routeHouseId || inviteToken || (pathname !== "/app" && pathname !== "/") || !session) return;
    const homeSocket: TypedSocket = io(SOCKET_URL, { auth: { token: session.token }, transports: ["websocket", "polling"] });
    homeSocket.on("home:update", (next) => { houseRequestVersion.current += 1; setHouses(next); });
    homeSocket.on("profile:update", (user) => setSession((current) => { if (!current || current.user.id !== user.id) return current; const updated = { ...current, user }; localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); return updated; }));
    return () => { homeSocket.disconnect(); };
  }, [authStatus, routeHouseId, inviteToken, pathname, session?.token]);
  useEffect(() => { if (routeHouseId && selectedHouse) document.title = `${selectedHouse.name} — Lumio`; }, [routeHouseId, selectedHouse?.name]);

  useEffect(() => {
    if (!session || !routeHouseId || !selectedHouse || selectedHouse.id !== routeHouseId) return;
    const nextSocket: TypedSocket = io(SOCKET_URL, { auth: { token: session.token }, transports: ["websocket", "polling"] });
    setSocket(nextSocket);
    setConnectionState("connecting"); setEntryError("");
    hadSnapshot.current = false; reconnecting.current = false; membersSeen.current.clear(); queueSeen.current.clear(); latestMedia.current = null; screenShareActor.current = null; feedbackRevision.current = -1;
    nextSocket.on("connect", () => { setConnectionState(hadSnapshot.current ? "reconnecting" : "connecting"); nextSocket.emit(eventNames.roomJoin, { roomId: selectedHouse.primaryRoomId, user: session.user }); });
    nextSocket.on("disconnect", () => { reconnecting.current = hadSnapshot.current; if (callActiveRef.current) { resetPeers.current(); setCallState("reconnecting"); } setConnectionState(hadSnapshot.current ? "reconnecting" : "offline"); window.clearTimeout(offlineTimer.current); offlineTimer.current = window.setTimeout(() => setConnectionState("offline"), 8000); });
    nextSocket.on("connect_error", (error) => {
      if (!hadSnapshot.current) setConnectionState("offline");
      if (error.message.toLowerCase().includes("sessão inválida")) {
        localStorage.removeItem(SESSION_KEY);
        setAuthError("Sua sessão expirou. Entre novamente para continuar.");
        setSession(null);
      }
    });
    nextSocket.on("room:snapshot", (nextSnapshot) => {
      const first = !hadSnapshot.current;
      const recovered = reconnecting.current;
      window.clearTimeout(offlineTimer.current);
      setConnectionState("connected");
      hadSnapshot.current = true; reconnecting.current = false;
      if (first || recovered) {
        membersSeen.current = new Map(nextSnapshot.members.map((member) => [member.user.id, member.user.displayName]));
        queueSeen.current = new Set(nextSnapshot.queue.map((item) => item.id));
        latestMedia.current = nextSnapshot.currentMedia;
        screenShareActor.current = nextSnapshot.screenShare ? { id: nextSnapshot.screenShare.user.id, name: nextSnapshot.screenShare.user.displayName } : null;
        feedbackRevision.current = nextSnapshot.currentMedia.revision;
        setPlayerResyncToken((value) => value + 1);
        if (recovered) notifyParty("Conectado novamente.", "success");
      } else {
        const nextMembers = new Map(nextSnapshot.members.map((member) => [member.user.id, member.user.displayName]));
        for (const [id, name] of nextMembers) if (!membersSeen.current.has(id) && id !== session.user.id) notifyParty(`${name} entrou na Party.`);
        for (const [id, name] of membersSeen.current) if (!nextMembers.has(id) && id !== session.user.id) notifyParty(`${name} saiu da Party.`);
        membersSeen.current = nextMembers;
      }
      setSnapshot((current) => current ? { ...nextSnapshot, currentMedia: nextSnapshot.currentMedia.revision < current.currentMedia.revision ? current.currentMedia : nextSnapshot.currentMedia, queue: nextSnapshot.queueRevision < current.queueRevision ? current.queue : nextSnapshot.queue, queueRevision: Math.max(nextSnapshot.queueRevision, current.queueRevision) } : nextSnapshot);
      if (recovered && callActiveRef.current) { const generation = callGeneration.current; nextSocket.emit(eventNames.voiceJoin, { roomId: nextSnapshot.id }, (result) => { if (!callActiveRef.current || generation !== callGeneration.current) return; if (result.ok) setCallState("connected"); else rejectCall(result.message ?? "Não foi possível voltar à call."); }); }
    });
    nextSocket.on("presence:update", (members) => setSnapshot((current) => current ? { ...current, members, connectedCount: members.length } : current));
    nextSocket.on("queue:update", (queue, queueRevision) => {
      const added = queue.find((item) => !queueSeen.current.has(item.id) && item.addedBy.id !== session.user.id);
      if (added && !(drawerStateRef.current.open && drawerStateRef.current.panel === "queue") && hadSnapshot.current) notifyParty(`${added.addedBy.displayName} adicionou “${added.title}” à fila.`);
      queueSeen.current = new Set(queue.map((item) => item.id));
      setSnapshot((current) => current && queueRevision >= current.queueRevision ? { ...current, queue, queueRevision } : current);
    });
    nextSocket.on("queue:history", (historyItems) => setSnapshot((current) => current ? { ...current, history: historyItems } : current));
    nextSocket.on("room:mode", (mode) => setSnapshot((current) => current ? { ...current, mode } : current));
    nextSocket.on("room:settings", (settings) => setSnapshot((current) => current ? { ...current, settings } : current));
    nextSocket.on("vote:skip", (vote) => setSnapshot((current) => current ? { ...current, skipVote: { count: vote.count, required: vote.required, votedBy: vote.votedBy } } : current));
    nextSocket.on("media:sync", (media) => {
      const previous = latestMedia.current;
      if (previous && media.revision > feedbackRevision.current && media.controlledBy !== session.user.id) {
        if (media.mediaId !== previous.mediaId && media.mediaId) notifyParty(`Agora: ${media.title}`);
        else if (media.mediaId === previous.mediaId && Math.abs(expectedPosition(media) - expectedPosition(previous)) > 25) notifyParty(`Reprodução avançou para ${formatDuration(media.position)}.`);
      }
      if (!previous || media.revision >= previous.revision) latestMedia.current = media;
      feedbackRevision.current = Math.max(feedbackRevision.current, media.revision);
      setSnapshot((current) => current && media.revision >= current.currentMedia.revision ? { ...current, currentMedia: media } : current);
    });
    nextSocket.on("chat:message", (message) => { setSnapshot((current) => current && !current.messages.some((item) => item.id === message.id) ? { ...current, messages: [...current.messages, message].slice(-80) } : current); if (message.user.id !== session.user.id && !(drawerStateRef.current.open && drawerStateRef.current.panel === "chat")) setUnreadChat((value) => value + 1); });
    nextSocket.on("chat:typing", ({ userId, typing }) => setTypingUserIds((current) => typing ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    nextSocket.on("reaction:send", (value) => { setReaction(value); window.setTimeout(() => setReaction(null), 2200); });
    nextSocket.on("screen:state", (state) => { const previous = screenShareActor.current; screenShareActor.current = state ? { id: state.user.id, name: state.user.displayName } : null; setSnapshot((current) => current ? { ...current, screenShare: state } : current); if (state) { setStageView("screen"); if (state.user.id !== session.user.id && previous?.id !== state.user.id) { notifyParty(`${state.user.displayName} começou a compartilhar a tela.`); void joinCallRef.current(false); } } else { setStageView("media"); setRemoteScreenStream(null); if (previous && previous.id !== session.user.id) notifyParty(`${previous.name} parou de compartilhar a tela.`); } });
    nextSocket.on("house:update", (nextHouse) => { if (nextHouse.id === routeHouseId) setHouse(nextHouse); });
    nextSocket.on("home:update", (next) => { houseRequestVersion.current += 1; setHouses(next); });
    nextSocket.on("profile:update", (user) => setSession((current) => { if (!current || current.user.id !== user.id) return current; const updated = { ...current, user }; localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); return updated; }));
    nextSocket.on("media-hub:update", ({ houseId }) => { if (houseId === routeHouseId) setMediaHubRevision((value) => value + 1); });
    nextSocket.on("member:removed", ({ houseId, message }) => { if (houseId !== routeHouseId) return; setHousesError(message); setSnapshot(null); setHouse(null); localStorage.removeItem(HOUSE_KEY); navigate("/app"); void refreshHouses(); });
    nextSocket.on("server:error", (message) => { if (!hadSnapshot.current) { setEntryError(message); setConnectionState("error"); } else notifyParty(message, "error"); });
    return () => { window.clearTimeout(offlineTimer.current); if (nextSocket.connected) nextSocket.emit(eventNames.roomLeave, selectedHouse.primaryRoomId); nextSocket.disconnect(); resetPeers.current(); callGeneration.current += 1; callActiveRef.current = false; micRequestInFlight.current = false; analyserCleanup.current?.(); analyserCleanup.current = null; localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null; displayStream.current?.getTracks().forEach((track) => track.stop()); displayStream.current = null; setCallState("idle"); setMicEnabled(false); setLocalScreenStream(null); setRemoteScreenStream(null); setSocket(null); };
  }, [session?.token, routeHouseId, selectedHouse?.id, selectedHouse?.primaryRoomId, rejectCall]);

  useEffect(() => {
    if (!session || !routeHouseId) return;
    const controller = new AbortController(); let active = true;
    fetch(`${API_URL}/api/houses/${routeHouseId}`, { headers: authHeaders, signal: controller.signal }).then(async (response) => { if (response.ok) { const data = await response.json() as { house: HouseDetails }; if (active && data.house.id === routeHouseId) setHouse(data.house); } }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [session?.token, routeHouseId]);

  useEffect(() => {
    if (!socket || !snapshot) return; let active = true; let idleTimer = window.setTimeout(() => { active = false; socket.emit(eventNames.presenceActivity, { roomId: snapshot.id, active: false }); }, 5 * 60_000);
    const markActive = () => { window.clearTimeout(idleTimer); if (!active) { active = true; socket.emit(eventNames.presenceActivity, { roomId: snapshot.id, active: true }); } idleTimer = window.setTimeout(() => { active = false; socket.emit(eventNames.presenceActivity, { roomId: snapshot.id, active: false }); }, 5 * 60_000); };
    for (const event of ["pointerdown", "keydown", "focus"] as const) window.addEventListener(event, markActive, { passive: true });
    return () => { window.clearTimeout(idleTimer); for (const event of ["pointerdown", "keydown", "focus"] as const) window.removeEventListener(event, markActive); };
  }, [socket, snapshot?.id]);

  useEffect(() => {
    if (!socket || !snapshot) return;
    const onVisibilityChange = () => { if (document.visibilityState === "visible") socket.emit(eventNames.mediaRequestSync, { roomId: snapshot.id }); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [socket, snapshot?.id]);

  useEffect(() => {
    if (!session || !snapshot || snapshot.currentMedia.state !== "playing") return;
    const item = snapshot.queue.find((candidate) => candidate.provider === snapshot.currentMedia.provider && candidate.providerMediaId === snapshot.currentMedia.mediaId);
    if (!item) return;
    const checkpoint = () => void fetch(`${API_URL}/api/media-hub/${snapshot.id}/progress`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ item, position: expectedPosition(snapshot.currentMedia) }) });
    const timer = window.setInterval(checkpoint, 15_000);
    return () => { window.clearInterval(timer); checkpoint(); };
  }, [session, snapshot?.id, snapshot?.currentMedia.mediaId, snapshot?.currentMedia.provider, snapshot?.currentMedia.state]);

  useEffect(() => () => {
    analyserCleanup.current?.();
    localStream.current?.getTracks().forEach((track) => track.stop());
    displayStream.current?.getTracks().forEach((track) => track.stop());
    peerConnections.current.forEach((connection) => connection.close());
    remoteAudio.current.forEach((audio) => { audio.pause(); audio.srcObject = null; });
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const state = peerSessions.current.get(peerId);
    window.clearTimeout(state?.restartTimer); window.clearTimeout(state?.disconnectTimer);
    peerSessions.current.delete(peerId);
    const connection = peerConnections.current.get(peerId);
    if (connection) { connection.onnegotiationneeded = null; connection.onicecandidate = null; connection.ontrack = null; connection.onconnectionstatechange = null; connection.close(); peerConnections.current.delete(peerId); }
    const audio = remoteAudio.current.get(peerId);
    if (audio) { audio.pause(); audio.srcObject = null; remoteAudio.current.delete(peerId); }
    if (screenShareActor.current?.id === peerId) setRemoteScreenStream(null);
  }, []);
  const closeAllPeers = useCallback(() => { for (const peerId of [...peerConnections.current.keys()]) closePeer(peerId); }, [closePeer]);
  resetPeers.current = closeAllPeers;

  useEffect(() => {
    if (!routeHouseId || !navigator.mediaDevices?.enumerateDevices) return;
    const refresh = () => void navigator.mediaDevices.enumerateDevices().then((devices) => { setAudioDevices(devices.filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")); if (audioSettingsRef.current.inputDeviceId && !devices.some((device) => device.kind === "audioinput" && device.deviceId === audioSettingsRef.current.inputDeviceId)) { setAudioSettings((current) => ({ ...current, inputDeviceId: "" })); setVoiceError("Microfone desconectado; tentando o dispositivo padrão."); } if (audioSettingsRef.current.outputDeviceId && !devices.some((device) => device.kind === "audiooutput" && device.deviceId === audioSettingsRef.current.outputDeviceId)) { setAudioSettings((current) => ({ ...current, outputDeviceId: "" })); setVoiceError("Saída de áudio desconectada; usando o dispositivo padrão."); } }).catch(() => undefined);
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
  }, [routeHouseId]);

  useEffect(() => {
    remoteAudio.current.forEach((audio, userId) => {
      audio.volume = ((participantVolumes[userId] ?? 80) / 100) * (audioSettings.callVolume / 100);
      audio.muted = deafened;
      if ("setSinkId" in audio) void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioSettings.outputDeviceId).catch(() => setVoiceError("Não foi possível selecionar a saída de áudio."));
    });
  }, [audioSettings.callVolume, audioSettings.outputDeviceId, deafened, participantVolumes]);

  useEffect(() => {
    const roomId = snapshot?.id;
    if (!socket || !roomId || !session || !window.RTCPeerConnection || callState === "idle") return;
    const send = (peerId: string, signal: { type: "offer" | "answer"; sdp: string } | { candidate: RTCIceCandidateInit & { candidate: string } }) => {
      const state = peerSessions.current.get(peerId);
      if (state && socket.connected) socket.emit(eventNames.voiceSignal, { roomId, targetUserId: peerId, targetSocketId: state.socketId, signal });
    };
    const createPeer = (peerId: string, socketId: string) => {
      const existing = peerConnections.current.get(peerId);
      if (existing && peerSessions.current.get(peerId)?.socketId === socketId) return existing;
      if (existing) closePeer(peerId);
      const state = { socketId, polite: session.user.id > peerId, makingOffer: false, ignoreOffer: false, settingAnswer: false, candidates: [] as RTCIceCandidateInit[], restartAttempts: 0, restartTimer: undefined as number | undefined, disconnectTimer: undefined as number | undefined };
      peerSessions.current.set(peerId, state);
      const connection = new RTCPeerConnection(rtcConfiguration.current);
      peerConnections.current.set(peerId, connection);
      if (localStream.current?.getAudioTracks().length) connection.addTrack(localStream.current.getAudioTracks()[0], localStream.current);
      else connection.addTransceiver("audio", { direction: "recvonly" });
      if (displayStream.current?.getVideoTracks().length) connection.addTrack(displayStream.current.getVideoTracks()[0], displayStream.current);
      else connection.addTransceiver("video", { direction: "recvonly" });
      connection.onnegotiationneeded = async () => {
        try { state.makingOffer = true; await connection.setLocalDescription(); if (connection.localDescription?.sdp && (connection.localDescription.type === "offer" || connection.localDescription.type === "answer")) send(peerId, { type: connection.localDescription.type, sdp: connection.localDescription.sdp }); }
        catch { if (connection.signalingState !== "closed") setVoiceError("Não foi possível negociar a conexão da call."); }
        finally { state.makingOffer = false; }
      };
      connection.onicecandidate = (event) => { if (event.candidate) send(peerId, { candidate: { ...event.candidate.toJSON(), candidate: event.candidate.candidate } }); };
      connection.ontrack = (event) => {
        if (event.track.kind === "video") {
          const videoStream = new MediaStream([event.track]); setRemoteScreenStream(videoStream); setStageView("screen");
          event.track.addEventListener("ended", () => setRemoteScreenStream((current) => current === videoStream ? null : current), { once: true });
          event.track.addEventListener("mute", () => setRemoteScreenStream((current) => current === videoStream ? null : current));
          event.track.addEventListener("unmute", () => setRemoteScreenStream(videoStream));
          return;
        }
        const audio = remoteAudio.current.get(peerId) ?? new Audio();
        audio.autoplay = true; audio.srcObject = event.streams[0] ?? new MediaStream([event.track]); audio.volume = ((participantVolumesRef.current[peerId] ?? 80) / 100) * (audioSettingsRef.current.callVolume / 100); audio.muted = deafenedRef.current;
        if (audioSettingsRef.current.outputDeviceId && "setSinkId" in audio) void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioSettingsRef.current.outputDeviceId).catch(() => setVoiceError("Não foi possível selecionar a saída de áudio."));
        remoteAudio.current.set(peerId, audio); void audio.play().then(() => setAudioBlocked(false), () => setAudioBlocked(true));
      };
      const restart = () => {
        if (connection.connectionState === "closed" || connection.connectionState === "connected" || state.restartTimer) return;
        if (state.restartAttempts >= 3) { setCallState("error"); setVoiceError("Não foi possível restabelecer a call. Saia e entre novamente; confira a configuração TURN se estiver em redes diferentes."); return; }
        state.restartTimer = window.setTimeout(() => {
          state.restartTimer = undefined;
          if (connection.connectionState === "connected" || connection.connectionState === "closed") return;
          state.restartAttempts += 1;
          try { connection.restartIce(); } catch { /* Retry remains bounded below. */ }
          state.restartTimer = window.setTimeout(() => { state.restartTimer = undefined; restart(); }, 6000);
        }, Math.min(1000 * 2 ** state.restartAttempts, 4000));
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") { window.clearTimeout(state.restartTimer); window.clearTimeout(state.disconnectTimer); state.restartTimer = undefined; state.restartAttempts = 0; if (![...peerConnections.current.values()].some((peer) => peer.connectionState === "failed" || peer.connectionState === "disconnected")) { setVoiceError(""); setCallState("connected"); } }
        if (connection.connectionState === "disconnected") { setCallState("reconnecting"); state.disconnectTimer ??= window.setTimeout(() => { state.disconnectTimer = undefined; restart(); }, 2500); }
        if (connection.connectionState === "failed") { setCallState("reconnecting"); setVoiceError("Conexão instável; tentando recuperar a call…"); restart(); }
      };
      return connection;
    };
    const onPeerJoined = (peer: VoicePeer) => { if (callActiveRef.current && peer.user.id !== session.user.id) createPeer(peer.user.id, peer.socketId); };
    const onSignal: ServerToClientEvents["voice:signal"] = async ({ fromUserId, fromSocketId, signal }) => {
      if (!callActiveRef.current || fromUserId === session.user.id || peerSessions.current.get(fromUserId)?.socketId !== fromSocketId) return;
      const connection = createPeer(fromUserId, fromSocketId); const state = peerSessions.current.get(fromUserId)!;
      try {
        if ("candidate" in signal) {
          if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
          else if (!state.ignoreOffer) state.candidates.push(signal.candidate);
          return;
        }
        const isOffer = signal.type === "offer";
        state.ignoreOffer = isOffer && shouldIgnoreOffer({ polite: state.polite, makingOffer: state.makingOffer, signalingState: connection.signalingState, settingAnswer: state.settingAnswer });
        if (state.ignoreOffer) return;
        state.settingAnswer = signal.type === "answer";
        await connection.setRemoteDescription(signal);
        state.settingAnswer = false;
        for (const candidate of state.candidates.splice(0)) await connection.addIceCandidate(candidate);
        if (isOffer) { await connection.setLocalDescription(); if (connection.localDescription?.sdp) send(fromUserId, { type: "answer", sdp: connection.localDescription.sdp }); }
      } catch { state.settingAnswer = false; if (!state.ignoreOffer && connection.signalingState !== "closed") setVoiceError("Falha na negociação da call; tentando recuperar."); }
    };
    const onPeerLeft: ServerToClientEvents["voice:peer-left"] = (peer) => { if (peerSessions.current.get(peer.userId)?.socketId === peer.socketId) closePeer(peer.userId); };
    socket.on("voice:peer-joined", onPeerJoined); socket.on("voice:signal", onSignal); socket.on("voice:peer-left", onPeerLeft);
    return () => { socket.off("voice:peer-joined", onPeerJoined); socket.off("voice:signal", onSignal); socket.off("voice:peer-left", onPeerLeft); };
  }, [session?.user.id, snapshot?.id, socket, callState === "idle", closePeer]);

  useEffect(() => {
    if (!routeHouseId) return;
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") { shortcutActions.current.closeTop?.(); return; }
      if (isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() === "d") shortcutActions.current.toggleDeafen?.();
      if (["t", "c"].includes(event.key.toLowerCase())) { event.preventDefault(); shortcutActions.current.toggleTheater?.(); }
      if (event.key === "/") { event.preventDefault(); setShowMediaHub(true); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [routeHouseId]);

  const finishAuthentication = (data: SessionData) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data)); setSession(data); setHouses([]); setAuthStatus("authenticated");
    const next = new URLSearchParams(path.split("?")[1] ?? "").get("next"); navigate(safeAuthDestination(next));
  };
  const authenticate = async (mode: "signup" | "login", input: { displayName: string; email: string; password: string }) => {
    setAuthError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json() as SessionData & { message?: string; code?: string; pendingVerification?: boolean };
      if (data.pendingVerification || data.code === "EMAIL_UNVERIFIED") { navigate(`/verify-email?email=${encodeURIComponent(input.email)}`); return; }
      if (!response.ok) { setAuthError(data.message ?? "Não foi possível entrar."); return; }
      finishAuthentication(data);
    } catch { setAuthError("Não foi possível alcançar o servidor. Verifique se a API está rodando."); }
  };
  const logout = () => {
    if (session) void fetch(`${API_URL}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } });
    socket?.disconnect(); callGeneration.current += 1; callActiveRef.current = false; micRequestInFlight.current = false; analyserCleanup.current?.(); analyserCleanup.current = null; localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null; displayStream.current?.getTracks().forEach((track) => track.stop()); displayStream.current = null; resetPeers.current();
    localStorage.removeItem(SESSION_KEY); localStorage.removeItem(HOUSE_KEY); setSession(null); setHouses([]); setHouse(null); setSnapshot(null); setSocket(null); setMicEnabled(false); setCallState("idle"); setAudioBlocked(false); setLocalScreenStream(null); setRemoteScreenStream(null); setAuthStatus("unauthenticated"); navigate("/");
  };

  const sendChat = (body: string) => { if (body.trim() && snapshot && socket?.connected) { socket.emit(eventNames.chatMessage, { roomId: snapshot.id, body }); return true; } notifyParty("Sem conexão com a Party. Tente novamente.", "error"); return false; };
  const sendReaction = (emoji: string) => { if (snapshot && socket?.connected) socket.emit(eventNames.reactionSend, { roomId: snapshot.id, emoji }); };
  const voteToSkip = () => { if (snapshot) socket?.emit(eventNames.voteSkip, { roomId: snapshot.id }); };
  const nextMedia = () => { if (snapshot) socket?.emit(eventNames.queueNext, { roomId: snapshot.id }); };
  const previousMedia = () => { if (snapshot) socket?.emit(eventNames.queuePrevious, { roomId: snapshot.id }); };
  const moveQueueItem = (itemId: string, toIndex: number) => {
    if (!snapshot || !socket?.connected) return void notifyParty("Sem conexão com a Party. Tente novamente.", "error");
    socket.emit(eventNames.queueMove, { roomId: snapshot.id, itemId, toIndex, revision: snapshot.queueRevision });
  };
  const sendPlaybackCommand = useCallback((command: { action: "play" | "pause" | "seek" | "rate"; position: number; playbackRate?: number }) => {
    if (!socket?.connected || !snapshot || !snapshot.currentMedia.mediaId) { notifyParty("Sem conexão com a Party. Tente novamente.", "error"); return false; }
    const role = snapshot.members.find((member) => member.user.id === session?.user.id)?.role;
    const allowed = role && (["OWNER", "HOST", "ADMIN"].includes(role) || (snapshot.settings.mediaControl === "everyone" && role !== "GUEST") || (snapshot.settings.mediaControl === "host-moderators" && ["MODERATOR", "DJ"].includes(role)));
    if (!allowed) { notifyParty("Você não tem permissão para controlar a reprodução.", "error"); return false; }
    const event = command.action === "play" ? eventNames.mediaPlay : command.action === "pause" ? eventNames.mediaPause : command.action === "seek" ? eventNames.mediaSeek : eventNames.mediaRate;
    socket.emit(event, { roomId: snapshot.id, mediaId: snapshot.currentMedia.mediaId, revision: snapshot.currentMedia.revision, operationId: crypto.randomUUID(), position: command.position, playbackRate: command.playbackRate });
    return true;
  }, [socket, snapshot, session?.user.id, notifyParty]);
  const addMedia = async (media: MediaItem, playNow = false): Promise<{ position: number }> => {
    if (!socket?.connected || !snapshot || !session) throw new Error("Sem conexão com a Party. Tente novamente.");
    const roomId = snapshot.id;
    const item = toQueueItem(media, session.user);
    const result = await socket.timeout(10_000).emitWithAck(eventNames.queueAdd, { roomId, item });
    if (!result.ok || !result.item) throw new Error(result.message ?? "Não foi possível adicionar à fila.");
    if (playNow || canControlMedia && (snapshot.queue.length === 0 || !snapshot.currentMedia.mediaId)) {
      const change = await socket.timeout(10_000).emitWithAck(eventNames.mediaChange, { roomId, item: result.item });
      if (!change.ok) throw new Error(change.message ?? "Mídia adicionada, mas não foi possível iniciar a reprodução.");
    }
    return { position: result.position ?? snapshot.queue.length + 1 };
  };
  const playMediaNext = async (media: MediaItem): Promise<void> => {
    if (!socket?.connected || !snapshot || !session) throw new Error("Sem conexão com a Party. Tente novamente.");
    const result = await socket.timeout(10_000).emitWithAck(eventNames.queuePlayNext, { roomId: snapshot.id, item: toQueueItem(media, session.user), revision: snapshot.queueRevision });
    if (!result.ok) throw new Error(result.message ?? "Não foi possível alterar a fila.");
  };
  const clearQueue = () => {
    if (!socket?.connected || !snapshot) return void notifyParty("Sem conexão com a Party. Tente novamente.", "error");
    socket.emit(eventNames.queueClear, { roomId: snapshot.id, revision: snapshot.queueRevision }, (result) => { if (!result.ok) setVoiceError(result.message ?? "Não foi possível limpar a fila."); });
    setConfirmClearQueue(false);
  };

  const handleProviderEnded = useCallback(() => { const playing = snapshot?.queue.find((item) => item.status === "playing"); if (socket && snapshot && playing) socket.emit(eventNames.queueAdvance, { roomId: snapshot.id, expectedMediaId: snapshot.currentMedia.mediaId, expectedQueueItemId: playing.id, revision: snapshot.queueRevision }); }, [socket, snapshot?.id, snapshot?.currentMedia.mediaId, snapshot?.queueRevision, snapshot?.queue]);

  const startMicMeter = useCallback((stream: MediaStream) => {
    analyserCleanup.current?.();
    if (!window.AudioContext) { setMicLevel(0); analyserCleanup.current = null; return; }
    try {
    const audioContext = new AudioContext(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .75;
    void audioContext.resume().catch(() => undefined);
    const source = audioContext.createMediaStreamSource(stream); source.connect(analyser); const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0; let lastPaint = 0; let lastEmitted = false; let above = 0; let below = 0;
    const listen = (now: number) => {
      analyser.getByteFrequencyData(data); const average = data.reduce((total, item) => total + item, 0) / data.length; const level = Math.min(100, average * 2.6);
      if (now - lastPaint > 100) { setMicLevel(level); lastPaint = now; }
      if (level > 20) { above += 1; below = 0; } else if (level < 12) { below += 1; above = 0; }
      const transmitting = audioSettingsRef.current.microphoneMode === "voice" ? !mutedRef.current : stream.getAudioTracks().some((track) => track.enabled);
      const nextSpeaking = !deafenedRef.current && transmitting && (lastEmitted ? below < 5 : above >= 2);
      if (nextSpeaking !== lastEmitted) {
        if (snapshot?.id) socket?.emit(eventNames.voiceSpeaking, { roomId: snapshot.id, speaking: nextSpeaking, muted: mutedRef.current, deafened: deafenedRef.current }); setSpeaking(nextSpeaking); lastEmitted = nextSpeaking;
      }
      frame = requestAnimationFrame(listen);
    };
    frame = requestAnimationFrame(listen); analyserCleanup.current = () => { cancelAnimationFrame(frame); setMicLevel(0); void audioContext.close(); };
    } catch { setMicLevel(0); analyserCleanup.current = null; }
  }, [socket, snapshot?.id]);

  const joinCall = async (withMic: boolean, deviceOverride?: string) => {
    if (!snapshot) return;
    if (!socket?.connected || !window.RTCPeerConnection) { setVoiceError("A call está indisponível enquanto a Party reconecta."); return; }
    if (withMic && ((micEnabled && localStream.current?.getAudioTracks().some((track) => track.readyState === "live")) || micRequestInFlight.current)) return;
    if (withMic) micRequestInFlight.current = true;
    const generation = callActiveRef.current ? callGeneration.current : ++callGeneration.current;
    if (!callActiveRef.current) {
      callActiveRef.current = true;
      setVoiceError("");
      try {
        const response = await fetch(`${API_URL}/api/rtc/config?roomId=${encodeURIComponent(snapshot.id)}`, { headers: authHeaders });
        if (!response.ok) throw new Error("Configuração RTC indisponível");
        const config = await response.json() as { iceServers: RTCIceServer[] };
        rtcConfiguration.current = { iceServers: config.iceServers };
      } catch { rtcConfiguration.current = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }; setVoiceError("Configuração de rede indisponível; a call pode falhar fora da rede local."); }
      if (!callActiveRef.current || generation !== callGeneration.current) return;
      setCallState("joining");
    }
    if (!withMic) return;
    if (!navigator.mediaDevices?.getUserMedia) { micRequestInFlight.current = false; setVoiceError("Este navegador não oferece acesso ao microfone. Você pode ouvir a call."); return; }
    let acquired: MediaStream | null = null;
    try {
      const selectedDevice = deviceOverride ?? audioSettings.inputDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      acquired = stream;
      if (!callActiveRef.current || generation !== callGeneration.current || !socket.connected) { stream.getTracks().forEach((track) => track.stop()); return; }
      const shouldMute = deafened || audioSettings.microphoneMode === "ptt"; stream.getAudioTracks().forEach((track) => { track.enabled = !shouldMute; });
      const track = stream.getAudioTracks()[0];
      const replacements = await Promise.allSettled([...peerConnections.current.values()].map(async (connection) => { const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "audio"); if (sender) await sender.replaceTrack(track); else connection.addTrack(track, stream); }));
      if (!callActiveRef.current || generation !== callGeneration.current) { stream.getTracks().forEach((item) => item.stop()); return; }
      localStream.current = stream; setMicEnabled(true); setMuted(shouldMute); setVoiceError(replacements.some((result) => result.status === "rejected") ? "Microfone ativo, mas um participante não recebeu a nova track." : ""); startMicMeter(stream);
      track.addEventListener("ended", () => { if (localStream.current !== stream || !callActiveRef.current) return; analyserCleanup.current?.(); analyserCleanup.current = null; localStream.current = null; setMicEnabled(false); setVoiceError("Microfone desconectado; tentando o dispositivo padrão."); setAudioSettings((current) => ({ ...current, inputDeviceId: "" })); void joinCallRef.current(true, ""); }, { once: true });
      socket.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: shouldMute, deafened });
      void navigator.mediaDevices.enumerateDevices().then((devices) => setAudioDevices(devices.filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")));
    } catch { acquired?.getTracks().forEach((track) => track.stop()); if (generation === callGeneration.current) setVoiceError("Microfone indisponível. Você continua na call para ouvir; revise a permissão ou o dispositivo."); }
    finally { if (generation === callGeneration.current) micRequestInFlight.current = false; }
  };
  joinCallRef.current = joinCall;
  useEffect(() => { if (snapshot?.screenShare && !callActiveRef.current) void joinCallRef.current(false); }, [snapshot?.screenShare?.user.id]);
  useEffect(() => {
    if (callState !== "joining" || !socket?.connected || !snapshot) return;
    const generation = callGeneration.current;
    socket.emit(eventNames.voiceJoin, { roomId: snapshot.id }, (result) => { if (!callActiveRef.current || generation !== callGeneration.current) return; if (result.ok) setCallState("connected"); else rejectCall(result.message ?? "Não foi possível entrar na call."); });
  }, [callState, socket, snapshot?.id, rejectCall]);
  const leaveCall = () => {
    if (!snapshot) return;
    setCallState("leaving"); callGeneration.current += 1; callActiveRef.current = false; micRequestInFlight.current = false;
    if (displayStream.current) stopScreenShare(true);
    socket?.emit(eventNames.voiceLeave, { roomId: snapshot.id });
    localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
    analyserCleanup.current?.(); analyserCleanup.current = null;
    closeAllPeers(); setMicEnabled(false); setMuted(false); setSpeaking(false); setMicLevel(0); setCallQuality("Calculando"); setVoiceError(""); setAudioBlocked(false); setCallState("idle");
  };
  const toggleMute = () => {
    if (!micEnabled) return void joinCall(true);
    if (audioSettings.microphoneMode === "ptt") { setVoiceError("No modo push-to-talk, segure V para falar."); return; }
    const nextMuted = !muted; setMuted(nextMuted); localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    if (snapshot) socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: nextMuted, deafened });
  };
  const toggleDeafen = () => {
    const nextDeafened = !deafened; setDeafened(nextDeafened); remoteAudio.current.forEach((audio) => { audio.muted = nextDeafened; });
    if (nextDeafened) { setMuted(true); localStream.current?.getAudioTracks().forEach((track) => { track.enabled = false; }); }
    if (snapshot) socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: nextDeafened || muted, deafened: nextDeafened });
  };

  const stopScreenShare = useCallback((notifyServer = true) => {
    const stream = displayStream.current;
    if (stream) {
      peerConnections.current.forEach((connection) => connection.getSenders().filter((sender) => sender.track && stream.getTracks().includes(sender.track)).forEach((sender) => connection.removeTrack(sender)));
      stream.getTracks().forEach((track) => track.stop());
    }
    displayStream.current = null; setLocalScreenStream(null); setStageView("media");
    if (notifyServer && socket && snapshot) socket.emit(eventNames.screenStop, { roomId: snapshot.id });
  }, [socket, snapshot?.id]);

  const startScreenShare = async () => {
    if (!socket || !snapshot || !navigator.mediaDevices?.getDisplayMedia) { setVoiceError("Compartilhamento de tela não é suportado neste navegador."); return; }
    try {
      // Capture must begin inside the click activation; room authority is claimed immediately after selection.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: false });
      if (!socket.connected || !stream.getVideoTracks().length) { stream.getTracks().forEach((track) => track.stop()); setVoiceError("A Party desconectou antes de iniciar o compartilhamento."); return; }
      const timeout = window.setTimeout(() => { stream.getTracks().forEach((track) => track.stop()); setVoiceError("O servidor não confirmou o compartilhamento. Tente novamente."); }, 8000);
      socket.emit(eventNames.screenStart, { roomId: snapshot.id }, (result) => {
        window.clearTimeout(timeout);
        if (!socket.connected || stream.getVideoTracks()[0]?.readyState === "ended") { stream.getTracks().forEach((track) => track.stop()); if (result.ok) socket.emit(eventNames.screenStop, { roomId: snapshot.id }); return; }
        if (!result.ok) { stream.getTracks().forEach((track) => track.stop()); setVoiceError(result.message ?? "Outra pessoa já está compartilhando a tela."); return; }
        displayStream.current = stream; setLocalScreenStream(stream); setStageView("screen"); setVoiceError("");
        if (!callActiveRef.current) void joinCall(false);
        peerConnections.current.forEach((connection) => stream.getVideoTracks().forEach((track) => connection.addTrack(track, stream)));
        stream.getVideoTracks()[0]?.addEventListener("ended", () => stopScreenShare(true), { once: true });
      });
    } catch { setVoiceError("Não foi possível iniciar o compartilhamento de tela."); }
  };

  useEffect(() => {
    if (!micEnabled || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    const selectedDeviceId = audioSettings.inputDeviceId;
    void navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      const previous = localStream.current; const nextTrack = stream.getAudioTracks()[0];
      const shouldMute = deafenedRef.current || audioSettingsRef.current.microphoneMode === "ptt"; nextTrack.enabled = !shouldMute;
      try {
        await Promise.all([...peerConnections.current.values()].map(async (connection) => { const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "audio"); if (sender) await sender.replaceTrack(nextTrack); else connection.addTrack(nextTrack, stream); }));
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        previous?.getTracks().forEach((track) => track.stop()); localStream.current = stream; startMicMeter(stream); setMuted(shouldMute); setVoiceError("");
      } catch { stream.getTracks().forEach((track) => track.stop()); setVoiceError("Não foi possível trocar o microfone. O dispositivo anterior continua ativo."); }
    }).catch(() => { setVoiceError("Microfone selecionado indisponível; tentando o padrão."); if (selectedDeviceId) setAudioSettings((current) => ({ ...current, inputDeviceId: "" })); });
    return () => { cancelled = true; };
    // Device replacement should run only when the selected input changes.
  }, [audioSettings.inputDeviceId]);

  useEffect(() => {
    if (!micEnabled || !snapshot) return;
    const setTrackEnabled = (enabled: boolean) => localStream.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    if (audioSettings.microphoneMode === "voice") {
      const nextMuted = deafened; setTrackEnabled(!nextMuted); setMuted(nextMuted);
      socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: nextMuted, deafened });
      return;
    }
    setTrackEnabled(false); setMuted(true);
    const onDown = (event: KeyboardEvent) => { if (event.code !== "KeyV" || event.repeat || isEditableTarget(event.target) || deafenedRef.current || document.visibilityState !== "visible") return; event.preventDefault(); setTrackEnabled(true); mutedRef.current = false; setMuted(false); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: false, deafened: false }); };
    const release = (event?: Event) => { if (event instanceof KeyboardEvent && event.code !== "KeyV") return; if (event?.type === "visibilitychange" && document.visibilityState === "visible") return; setTrackEnabled(false); mutedRef.current = true; setMuted(true); setSpeaking(false); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: true, deafened: deafenedRef.current }); };
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", release); window.addEventListener("blur", release); document.addEventListener("visibilitychange", release);
    return () => { setTrackEnabled(false); window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", release); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release); };
  }, [audioSettings.microphoneMode, deafened, micEnabled, snapshot?.id, socket]);

  useEffect(() => {
    if (!micEnabled) { setCallQuality("Calculando"); return; }
    const inspect = async () => {
      let worstRtt = 0; let received = 0; let lost = 0;
      await Promise.all([...peerConnections.current.values()].map(async (connection) => {
        try { const reports = await connection.getStats(); reports.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") worstRtt = Math.max(worstRtt, report.currentRoundTripTime);
          if (report.type === "inbound-rtp" && report.kind === "audio") { received += Number(report.packetsReceived ?? 0); lost += Number(report.packetsLost ?? 0); }
        }); } catch { /* A peer may close while stats are being collected. */ }
      }));
      if (!peerConnections.current.size) { setCallQuality("Calculando"); return; }
      const loss = lost / Math.max(1, received + lost); setCallQuality(worstRtt < .15 && loss < .02 ? "Excelente" : worstRtt < .35 && loss < .06 ? "Boa" : "Instável");
    };
    void inspect(); const timer = window.setInterval(() => void inspect(), 8_000); return () => window.clearInterval(timer);
  }, [micEnabled]);

  shortcutActions.current = { toggleDeafen, toggleTheater: () => setTheaterMode((value) => !value), closeTop: () => {
    if (showMainMenu) setShowMainMenu(false);
    else if (showProfileMenu) setShowProfileMenu(false);
    else if (confirmClearQueue) setConfirmClearQueue(false);
    else if (showCallSettings) setShowCallSettings(false);
    else if (showProfile) setShowProfile(false);
    else if (showInvite) setShowInvite(false);
    else if (showHouseSettings) setShowHouseSettings(false);
    else if (showMediaHub) setShowMediaHub(false);
    else if (document.fullscreenElement) void document.exitFullscreen();
    else if (theaterMode) setTheaterMode(false);
    else if (!rightPanelCollapsed) { setRightPanelCollapsed(true); drawerReturnFocus.current?.focus(); }
  } };

  const openHouse = (target: HouseSummary) => { houseRequestVersion.current += 1; setSnapshot(null); setHouse(null); setShowHouseSettings(false); setShowInvite(false); setShowMediaHub(false); setTypingUserIds([]); setUnreadChat(0); localStorage.setItem(HOUSE_KEY, target.id); navigate(`/house/${encodeURIComponent(target.id)}`); };
  const createHomeHouse = async (name: string) => { if (!session) return; const response = await fetch(`${API_URL}/api/houses`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); if (!response.ok) { setHousesError((await response.json()).message ?? "Não foi possível criar a Casa."); return; } const data = await response.json() as { house: HouseDetails }; await refreshHouses(); openHouse(data.house); };
  const openInviteInput = () => { const value = window.prompt("Cole o link ou código do convite"); if (!value?.trim()) return; const token = value.includes("/invite/") ? value.split("/invite/")[1]?.split(/[?#]/)[0] : value.includes("?invite=") ? new URL(value).searchParams.get("invite") : value.trim(); if (token) navigate(`/invite/${encodeURIComponent(token)}`); };
  const acceptedInvite = async (houseId: string) => { await refreshHouses(); localStorage.setItem(HOUSE_KEY, houseId); setHouse(null); setSnapshot(null); navigate(`/house/${encodeURIComponent(houseId)}`); };

  if (authStatus === "unknown") return <BootstrapPage error={bootstrapError} onRetry={() => void bootstrap()} />;
  if (pathname === "/verify-email" || pathname === "/forgot-password" || pathname === "/reset-password") return <EmailActionPage key={pathname} mode={pathname === "/verify-email" ? "verify" : pathname === "/forgot-password" ? "forgot" : "reset"} apiUrl={API_URL} navigate={navigate} />;
  if (!session || authStatus === "unauthenticated") {
    if (inviteToken) return <InvitePage apiUrl={API_URL} token={inviteToken} session={null} navigate={navigate} onAccepted={async () => undefined} />;
    if (pathname === "/login" || pathname === "/register") return <AuthPage key={pathname} mode={pathname === "/login" ? "login" : "register"} error={authError} apiUrl={API_URL} onSubmit={(data) => authenticate(pathname === "/login" ? "login" : "signup", data)} onGoogleLogin={finishAuthentication} navigate={navigate} />;
    return <LandingPage navigate={navigate} />;
  }
  if (inviteToken) return <InvitePage apiUrl={API_URL} token={inviteToken} session={session} navigate={navigate} onAccepted={acceptedInvite} />;
  if (pathname === "/account") return <Suspense fallback={<BootstrapPage onRetry={() => undefined} />}><AccountPage apiUrl={API_URL} token={session.token} onBack={() => navigate("/app")} /></Suspense>;
  if (!routeHouseId) return <HomePage user={session.user} houses={houses} error={housesError} onRetry={() => void refreshHouses()} onOpenHouse={openHouse} onCreate={createHomeHouse} onInvite={openInviteInput} onAccount={() => navigate("/account")} onLogout={logout} />;
  if (!houses.some((item) => item.id === routeHouseId)) return <main className="loading-screen"><LumioLogo /><h1>Casa indisponível</h1><p>Você não faz parte desta Casa.</p><button onClick={() => navigate("/app")}>Voltar para suas Casas</button></main>;
  if (!snapshot || snapshot.id !== selectedHouse?.primaryRoomId) return <LoadingScreen user={session.user} connectionState={connectionState} error={entryError} onBack={() => navigate("/app")} />;

  const currentGroup = selectedHouse;
  const currentQueueItem = snapshot.queue.find((item) => item.status === "playing");
  const mediaRole = snapshot.members.find((member) => member.user.id === session.user.id)?.role;
  const canControlMedia = Boolean(mediaRole && (["OWNER", "HOST", "ADMIN"].includes(mediaRole) || snapshot.settings.mediaControl === "everyone" && mediaRole !== "GUEST" || snapshot.settings.mediaControl === "host-moderators" && ["MODERATOR", "DJ"].includes(mediaRole)));
  const canAddMedia = Boolean(mediaRole && (["OWNER", "HOST", "ADMIN"].includes(mediaRole) || snapshot.settings.queueControl === "everyone" || snapshot.settings.queueControl === "members" && mediaRole !== "GUEST"));
  const anotherMemberSpeaking = snapshot.members.some((member) => member.user.id !== session.user.id && member.speaking);
  const mediaVolume = audioSettings.mediaVolume * (audioSettings.duckingEnabled && anotherMemberSpeaking ? audioSettings.duckingVolume / 100 : 1);
  const isSharingScreen = snapshot.screenShare?.user.id === session.user.id;
  const switchHouse = (id: string) => { const target = houses.find((item) => item.id === id); if (target) openHouse(target); setShowMainMenu(false); };
  const createHouse = async () => { const name = window.prompt("Nome da nova Casa"); if (!name?.trim()) return; await createHomeHouse(name); };
  const openDrawer = (panel: "chat" | "members" | "queue") => { if (document.activeElement instanceof HTMLElement) drawerReturnFocus.current = document.activeElement; setActivePanel(panel); setRightPanelCollapsed(false); if (panel === "chat") setUnreadChat(0); };
  const closeDrawer = () => { setRightPanelCollapsed(true); requestAnimationFrame(() => drawerReturnFocus.current?.focus()); };
  const micLabel = !micEnabled ? callState === "idle" ? "Entrar na call" : "Ativar microfone" : muted ? "Ativar microfone" : "Desativar microfone";
  const syncLabel = connectionState === "connected" ? "Sincronizado com a Party" : connectionState === "connecting" ? "Entrando na Party" : connectionState === "reconnecting" ? "Reconectando à Party" : "Sem conexão com a Party";

  return <Suspense fallback={<LoadingScreen user={session.user} connectionState="connecting" onBack={() => navigate("/app")} />}><div className={`app-shell ${rightPanelCollapsed ? "panel-collapsed" : ""} ${theaterMode ? "theater-shell" : ""}`}>
    <a className="skip-link" href="#party-content">Ir para o conteúdo principal</a>
    <main className="party-main" id="party-content">
      <header className="party-header">
        <div className="header-identity">
          <button className="brand-menu-trigger" onClick={() => { setShowMainMenu((value) => !value); setShowProfileMenu(false); }} aria-label="Abrir menu do Lumio" aria-expanded={showMainMenu} aria-haspopup="menu"><LumioLogo /><span className="brand-name">Lumio</span><ChevronDown size={15} aria-hidden="true" /></button>
          {showMainMenu ? <nav className="main-menu-popover" aria-label="Menu principal"><strong>{currentGroup?.name ?? snapshot.groupName}</strong><button onClick={() => navigate("/app")}>Suas Casas</button>{houses.length > 1 ? <div className="house-switcher">{houses.map((item) => <button key={item.id} className={item.id === routeHouseId ? "active" : ""} onClick={() => switchHouse(item.id)}>{item.initials} · {item.name}<small>{item.onlineCount} online</small></button>)}</div> : null}<button className="active">Party</button><button onClick={() => { setShowMediaHub(true); setShowMainMenu(false); }}>Explorar mídia</button><button onClick={() => { setShowMediaHub(true); setShowMainMenu(false); }}><Library size={15} aria-hidden="true" /> Biblioteca</button><button onClick={() => { openDrawer("queue"); setShowHistory(true); setShowMainMenu(false); }}><Activity size={15} aria-hidden="true" /> Atividade</button><button onClick={() => { setShowHouseSettings(true); setShowMainMenu(false); }}><Settings size={15} aria-hidden="true" /> Casa e membros</button><button onClick={() => void createHouse()}><Plus size={15} /> Criar Casa</button><PwaInstallAction /><span className="menu-rule" /><button onClick={() => setPresentationMode((value) => value === "video" ? "music" : "video")}><Sparkles size={15} aria-hidden="true" /> Visualização: {presentationMode === "music" ? "Ambiente" : "Vídeo"}</button><button onClick={() => setAmbientMode((value) => !value)}><Sparkles size={15} aria-hidden="true" /> Luz ambiente {ambientMode ? "ligada" : "desligada"}</button><button onClick={() => { setTheaterMode((value) => !value); setShowMainMenu(false); }}><Maximize2 size={15} aria-hidden="true" /> {theaterMode ? "Sair do modo cinema" : "Modo cinema"}</button></nav> : null}
          <span className="header-divider" aria-hidden="true" />
          <h1>{snapshot.groupName}</h1>
          <span className={`sync-dot ${connectionState}`} role="status" aria-label={syncLabel} data-tooltip={syncLabel}><span /></span>
        </div>
        <div className="header-actions"><button className="header-icon" onClick={() => openDrawer("members")} aria-label={`Abrir pessoas, ${snapshot.members.length} na Party`} data-tooltip="Pessoas na Party"><Users size={18} aria-hidden="true" /><span>{snapshot.members.length}</span></button>{house?.permissions.includes("INVITE_CREATE") ? <button className="share-action" onClick={() => setShowInvite(true)}><Share2 size={17} aria-hidden="true" /> Convidar</button> : null}<div className="profile-anchor"><button className="header-avatar" onClick={() => { setShowProfileMenu((value) => !value); setShowMainMenu(false); }} aria-label="Abrir perfil" aria-expanded={showProfileMenu}><Avatar name={session.user.displayName} src={session.user.avatar} color={session.user.color} /></button>{showProfileMenu ? <div className="profile-popover"><strong>{session.user.displayName}</strong><small>{house?.role === "HOST" ? "Anfitrião" : house?.role === "ADMIN" ? "Admin" : "Membro"}</small>{session.user.status ? <small>{session.user.status}</small> : null}<button onClick={() => { setShowProfile(true); setShowProfileMenu(false); }}><Settings size={16} /> Editar perfil</button><button onClick={() => { navigate("/account"); setShowProfileMenu(false); }}><Settings size={16} /> Conta</button><button onClick={logout}><LogOut size={16} aria-hidden="true" /> Sair</button></div> : null}</div></div>
      </header>

      {connectionState !== "connected" ? <div className={`party-connection ${connectionState}`} role="status">{connectionState === "offline" ? "Sem conexão com a Party. Tentando reconectar..." : connectionState === "reconnecting" ? "Reconectando à Party..." : "Entrando na Party..."}</div> : null}
      {partyNotice ? <div className={`party-notice ${partyNotice.tone}`} role={partyNotice.tone === "error" ? "alert" : "status"}>{partyNotice.message}<button onClick={() => setPartyNotice(null)} aria-label="Dispensar aviso"><X size={14} aria-hidden="true" /></button></div> : null}

      <div className={`party-workspace ${rightPanelCollapsed ? "" : "drawer-open"}`}>
        <section className="party-content">
          <MainStage screenShare={snapshot.screenShare} screenStream={isSharingScreen ? localScreenStream : remoteScreenStream} view={stageView} onViewChange={setStageView} media={<MediaStage media={snapshot.currentMedia} roomId={snapshot.id} onSkip={nextMedia} onRemove={() => { if (currentQueueItem && window.confirm(`Remover “${currentQueueItem.title}” da fila?`)) socket?.emit(eventNames.queueRemove, { roomId: snapshot.id, itemId: currentQueueItem.id }); }} onAddMedia={() => setShowMediaHub(true)} onPlaybackCommand={sendPlaybackCommand} onEnded={handleProviderEnded} apiUrl={API_URL} token={session.token} theater={theaterMode} onTheaterChange={setTheaterMode} ambient={ambientMode} musicView={presentationMode === "music"} volume={audioSettings.mediaVolume} effectiveVolume={mediaVolume} onVolumeChange={(value) => setAudioSettings((current) => ({ ...current, mediaVolume: value }))} resyncToken={playerResyncToken} />} />
          {reaction ? <div className="reaction-float" key={reaction.id} aria-live="polite"><span>{reaction.emoji}</span><small>{reaction.user.displayName}</small></div> : null}
          {theaterMode ? <div className="theater-members" aria-label="Participantes">{snapshot.members.slice(0, 6).map((member) => <span key={member.user.id} className={member.speaking ? "speaking" : ""} title={member.user.displayName} style={{ background: member.user.color }}>{avatarLetters(member.user.displayName)}</span>)}</div> : null}

          <section className="now-playing" aria-labelledby="now-playing-title">
            <div className="now-playing-main"><span className="provider-badge">{providerLabel(snapshot.currentMedia.provider)}</span><div><p>Tocando agora</p><h2 id="now-playing-title">{snapshot.currentMedia.mediaId ? snapshot.currentMedia.title : "A Party está pronta"}</h2><span>{currentQueueItem ? `Adicionado por ${currentQueueItem.addedBy.displayName}` : "Escolha algo no Media Hub"}</span></div></div>
            {snapshot.currentMedia.mediaId ? <div className="party-media-actions"><div className="reaction-actions" aria-label="Reações">{["❤️", "😂", "👏", "🔥"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)} aria-label={`Enviar reação ${emoji}`} data-tooltip={`Reagir com ${emoji}`}>{emoji}</button>)}</div>{snapshot.settings.skipVotingEnabled ? <button className="skip-vote-action" onClick={voteToSkip} aria-label="Votar para pular" data-tooltip="Votar para pular"><SkipForward size={18} aria-hidden="true" /><span>{snapshot.skipVote.count}/{snapshot.skipVote.required}</span></button> : null}</div> : null}
          </section>
        </section>

        {!rightPanelCollapsed ? <aside className={`party-drawer ${activePanel === "chat" ? "is-chat" : ""}`} aria-label="Painel da Party"><div className="drawer-header"><div className="drawer-tabs" role="tablist" aria-label="Conteúdo da Party"><button className={activePanel === "chat" ? "active" : ""} onClick={() => setActivePanel("chat")} role="tab" aria-selected={activePanel === "chat"}>Chat</button><button className={activePanel === "members" ? "active" : ""} onClick={() => setActivePanel("members")} role="tab" aria-selected={activePanel === "members"}>Pessoas</button><button className={activePanel === "queue" ? "active" : ""} onClick={() => setActivePanel("queue")} role="tab" aria-selected={activePanel === "queue"}>Fila</button></div><button className="icon-button" onClick={closeDrawer} aria-label="Fechar painel" data-tooltip="Fechar"><X size={18} /></button></div>{activePanel === "chat" ? <ChatPanel messages={snapshot.messages} currentUser={session.user} typingNames={(house?.members ?? []).filter((member) => typingUserIds.includes(member.user.id)).map((member) => member.user.displayName)} onTyping={(typing) => socket?.emit(eventNames.chatTyping, { roomId: snapshot.id, typing })} onSend={sendChat} /> : activePanel === "members" ? <MembersPanel members={house?.members ?? snapshot.houseMembers ?? []} currentUserId={session.user.id} participantVolumes={participantVolumes} onVolume={(userId, volume) => setParticipantVolumes((current) => ({ ...current, [userId]: volume }))} /> : <div className="drawer-queue"><div className="drawer-section-title"><div><strong>Fila da Party</strong><span>{snapshot.queue.length} {snapshot.queue.length === 1 ? "item" : "itens"} · rev. {snapshot.queueRevision}</span></div><div className="drawer-title-actions"><button className={showHistory ? "active" : ""} onClick={() => setShowHistory((value) => !value)} aria-label="Alternar histórico" data-tooltip="Histórico"><History size={17} /></button>{house?.permissions.includes("QUEUE_MANAGE") && snapshot.queue.length > 1 ? <button onClick={() => setConfirmClearQueue(true)} aria-label="Limpar fila" data-tooltip="Limpar fila"><Trash2 size={16} /></button> : null}</div></div>{showHistory ? <HistoryList history={snapshot.history} /> : null}<QueueList queue={snapshot.queue} onPlay={(item) => socket?.emit(eventNames.mediaChange, { roomId: snapshot.id, item })} onRemove={(item) => { if (window.confirm(`Remover “${item.title}” da fila?`)) socket?.emit(eventNames.queueRemove, { roomId: snapshot.id, itemId: item.id }); }} onMove={moveQueueItem} onNext={nextMedia} onPrevious={previousMedia} onAdd={() => setShowMediaHub(true)} /></div>}</aside> : null}
        {!rightPanelCollapsed && activePanel === "chat" ? <MobileCallControls
          micEnabled={micEnabled} muted={muted} deafened={deafened} callState={callState} voiceError={voiceError}
          micLabel={micLabel} isSharingScreen={isSharingScreen} shareOccupied={Boolean(snapshot.screenShare && !isSharingScreen)}
          canShare={isSharingScreen || typeof navigator.mediaDevices?.getDisplayMedia === "function"}
          onMic={() => micEnabled ? toggleMute() : void joinCall(true)} onDeafen={toggleDeafen}
          onShare={() => isSharingScreen ? stopScreenShare(true) : void startScreenShare()}
          onSettings={() => setShowCallSettings(true)}
        /> : null}
      </div>

      <footer className="party-dock" aria-label="Controles da Party">
        {voiceError || callState !== "idle" ? <span className={`dock-call-state ${voiceError ? "error" : "connected"}`} aria-live="polite"><i />{voiceError || (callState === "reconnecting" ? "Reconectando a call…" : callState === "joining" ? "Entrando na call…" : !micEnabled ? "Na call · somente ouvindo" : audioSettings.microphoneMode === "ptt" ? "Segure V para falar" : speaking ? "Você está falando" : `Voz conectada · ${callQuality}`)}</span> : null}
        {audioBlocked ? <button className="dock-call-state error" onClick={() => { void Promise.all([...remoteAudio.current.values()].map((audio) => audio.play())).then(() => setAudioBlocked(false), () => setAudioBlocked(true)); }}>Ativar áudio da call</button> : null}
        <div className="dock-actions">
          <button className={`dock-button dock-call-action ${micEnabled && !muted ? "active" : ""} ${voiceError ? "error" : ""}`} onClick={() => micEnabled ? toggleMute() : void joinCall(true)} aria-label={voiceError ? "Microfone indisponível" : micLabel} data-tooltip={voiceError ? "Microfone indisponível" : micLabel}>{muted && micEnabled ? <MicOff size={20} /> : <Mic size={20} />}</button>
          <button className={`dock-button dock-call-action ${deafened ? "danger" : ""}`} onClick={toggleDeafen} aria-pressed={deafened} aria-label={deafened ? "Ativar áudio da call" : "Desativar áudio da call"} data-tooltip={deafened ? "Ativar áudio da call" : "Desativar áudio da call"}><Headphones size={20} /></button>
          {isSharingScreen || typeof navigator.mediaDevices?.getDisplayMedia === "function" ? <button className={`dock-button dock-call-action dock-screen-share ${isSharingScreen ? "active" : ""}`} disabled={Boolean(snapshot.screenShare && !isSharingScreen)} onClick={() => isSharingScreen ? stopScreenShare(true) : void startScreenShare()} aria-label={isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"} data-tooltip={isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"}>{isSharingScreen ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />}</button> : null}
          <button className={`dock-button ${!rightPanelCollapsed && activePanel === "chat" ? "selected" : ""}`} onClick={() => !rightPanelCollapsed && activePanel === "chat" ? closeDrawer() : openDrawer("chat")} aria-label={unreadChat ? `Abrir chat, ${unreadChat} não lidas` : "Abrir chat"} data-tooltip="Chat"><MessageCircle size={20} />{unreadChat ? <span className="dock-unread" aria-hidden="true" /> : null}</button>
          <button className={`dock-button ${!rightPanelCollapsed && activePanel === "members" ? "selected" : ""}`} onClick={() => !rightPanelCollapsed && activePanel === "members" ? closeDrawer() : openDrawer("members")} aria-label="Ver participantes" data-tooltip="Pessoas"><Users size={20} /></button>
          <button className={`dock-button ${!rightPanelCollapsed && activePanel === "queue" ? "selected" : ""}`} onClick={() => !rightPanelCollapsed && activePanel === "queue" ? closeDrawer() : openDrawer("queue")} aria-label={`Abrir fila, ${snapshot.queue.length} itens`} data-tooltip="Fila"><ListVideo size={20} />{snapshot.queue.length ? <span className="dock-badge">{snapshot.queue.length}</span> : null}</button>
          <button className="dock-button subtle" onClick={() => setShowCallSettings(true)} aria-label="Configurações de áudio" data-tooltip="Configurações de áudio"><SlidersHorizontal size={19} /></button><span className="dock-separator" /><button className="primary-action dock-add" onClick={() => setShowMediaHub(true)}><Plus size={18} /> Adicionar mídia</button>
        </div>
      </footer>
    </main>

    {showMediaHub ? <Suspense fallback={<div className="overlay-loading" role="status">Abrindo Media Hub...</div>}><MediaHub apiUrl={API_URL} token={session.token} roomId={snapshot.id} queueRevision={snapshot.queueRevision} refreshSignal={mediaHubRevision} permissions={house?.permissions ?? []} canControl={canControlMedia} canAdd={canAddMedia} onClose={() => setShowMediaHub(false)} onAdd={addMedia} onPlayNext={playMediaNext} /></Suspense> : null}
    {confirmClearQueue ? <div className="dialog-backdrop"><section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-queue-title"><h2 id="clear-queue-title">Limpar a fila?</h2><p>A mídia atual continua tocando. Os próximos itens serão removidos para todos.</p><div className="dialog-actions"><button onClick={() => setConfirmClearQueue(false)}>Cancelar</button><button className="danger-action" onClick={clearQueue}>Limpar fila</button></div></section></div> : null}
    {showInvite && house ? <InviteDialog apiUrl={API_URL} token={session.token} house={house} onClose={() => setShowInvite(false)} onChanged={(next) => setHouse(next)} /> : null}
    {showHouseSettings && house ? <HouseSettingsDialog apiUrl={API_URL} token={session.token} house={house} currentUserId={session.user.id} roomSettings={snapshot.settings} onRoomSettings={(settings) => socket?.emit(eventNames.roomSettings, { roomId: snapshot.id, settings })} onClose={() => setShowHouseSettings(false)} onLeft={() => { setShowHouseSettings(false); setSnapshot(null); setHouse(null); localStorage.removeItem(HOUSE_KEY); navigate("/app"); void refreshHouses(); }} onChanged={(next) => { setHouse(next); void refreshHouses(); }} /> : null}
    {showProfile ? <ProfileDialog apiUrl={API_URL} token={session.token} user={session.user} onClose={() => setShowProfile(false)} onSaved={(user) => { const nextSession = { ...session, user }; setSession(nextSession); localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession)); }} /> : null}
    {showCallSettings ? <Suspense fallback={<div className="overlay-loading" role="status">Abrindo configurações...</div>}><CallSettings settings={audioSettings} devices={audioDevices} micLevel={micLevel} connected={callState !== "idle"} outputSelectionSupported={"setSinkId" in HTMLMediaElement.prototype} onChange={setAudioSettings} onLeaveCall={() => { leaveCall(); setShowCallSettings(false); }} onClose={() => setShowCallSettings(false)} /></Suspense> : null}
  </div></Suspense>;
}

function MobileCallControls({ micEnabled, muted, deafened, callState, voiceError, micLabel, isSharingScreen, shareOccupied, canShare, onMic, onDeafen, onShare, onSettings }: {
  micEnabled: boolean; muted: boolean; deafened: boolean; callState: string; voiceError: string; micLabel: string;
  isSharingScreen: boolean; shareOccupied: boolean; canShare: boolean;
  onMic: () => void; onDeafen: () => void; onShare: () => void; onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <div className="mobile-call-controls">
    <button className={`mobile-call-trigger ${micEnabled && !muted ? "active" : ""}`} type="button" aria-label="Controles da call" aria-expanded={open} aria-controls="mobile-call-menu" onClick={() => setOpen((value) => !value)}>{micEnabled && muted ? <MicOff size={19} /> : <Mic size={19} />}</button>
    {open ? <div className="mobile-call-menu" id="mobile-call-menu" role="group" aria-label="Controles da call">
      <p>{voiceError || (callState === "idle" ? "Você não está na call" : callState === "joining" ? "Entrando na call…" : callState === "reconnecting" ? "Reconectando à call…" : "Na call")}</p>
      <button type="button" onClick={() => { onMic(); setOpen(false); }}>{micEnabled && !muted ? <MicOff size={18} /> : <Mic size={18} />}{micLabel}</button>
      <button type="button" onClick={() => { onDeafen(); setOpen(false); }}><Headphones size={18} />{deafened ? "Ativar áudio da call" : "Mutar áudio da call"}</button>
      {canShare ? <button type="button" disabled={shareOccupied} onClick={() => { onShare(); setOpen(false); }}>{isSharingScreen ? <ScreenShareOff size={18} /> : <MonitorUp size={18} />}{isSharingScreen ? "Parar compartilhamento" : shareOccupied ? "Alguém está compartilhando" : "Compartilhar tela"}</button> : null}
      <button type="button" onClick={() => { onSettings(); setOpen(false); }}><SlidersHorizontal size={18} />Configurações de áudio</button>
    </div> : null}
  </div>;
}

function LoadingScreen({ user, connectionState, error, onBack }: { user: User; connectionState: string; error?: string; onBack: () => void }) {
  return <main className="loading-screen"><LumioLogo /><h1>{connectionState === "error" ? "Não foi possível entrar na Party" : "Entrando na Party..."}</h1><p>{error || (connectionState === "offline" ? "Sem conexão com a Party. Tentando reconectar..." : `Preparando a sala, ${user.displayName}.`)}</p><button onClick={onBack}>Voltar para suas Casas</button></main>;
}

function QueueList({ queue, onPlay, onRemove, onMove, onNext, onPrevious, onAdd }: { queue: QueueItem[]; onPlay: (item: QueueItem) => void; onRemove: (item: QueueItem) => void; onMove: (id: string, toIndex: number) => void; onNext: () => void; onPrevious: () => void; onAdd: () => void }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  if (!queue.length) return <div className="queue-empty"><Library size={28} aria-hidden="true" /><h3>Nada na fila ainda.</h3><button className="primary-action compact" onClick={onAdd}><Plus size={17} aria-hidden="true" /> Adicionar mídia</button></div>;
  return <><div className="queue-toolbar"><span>Ordem de reprodução</span><div><button className="icon-button" onClick={onPrevious} aria-label="Mídia anterior"><SkipBack /></button><button className="icon-button" onClick={onNext} aria-label="Próxima mídia"><SkipForward /></button></div></div><ol className="queue-list">{queue.map((item, index) => {
    const isCurrent = item.status === "playing";
    return <li className={`queue-item ${isCurrent ? "current" : ""} ${draggedId === item.id ? "dragging" : ""} ${dragOverId === item.id ? "drop-target" : ""}`} key={item.id} draggable={!isCurrent} onDragStart={() => setDraggedId(item.id)} onDragEnter={() => setDragOverId(item.id)} onDragOver={(event) => event.preventDefault()} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }} onDrop={() => { if (draggedId && draggedId !== item.id) onMove(draggedId, index); setDraggedId(null); setDragOverId(null); }}>
      <button className="queue-play" onClick={() => onPlay(item)} aria-label={`Reproduzir ${item.title}`}>{isCurrent ? <Volume2 aria-hidden="true" /> : <span>{index + 1}</span>}</button>
      <QueueThumbnail item={item} />
      <div className="queue-copy"><small className="queue-position">{isCurrent ? "TOCANDO AGORA" : "A SEGUIR"}</small><strong>{item.title}</strong><span>{providerLabel(item.provider)} · {formatDuration(item.duration)} · Adicionado por {item.addedBy.displayName}</span></div>
      <div className="queue-actions"><button className="icon-button" onClick={() => onMove(item.id, Math.max(0, index - 1))} disabled={index === 0} aria-label={`Mover ${item.title} para cima`}><ChevronUp /></button><button className="icon-button" onClick={() => onMove(item.id, Math.min(queue.length - 1, index + 1))} disabled={index === queue.length - 1} aria-label={`Mover ${item.title} para baixo`}><ChevronDown /></button><button className="icon-button danger" onClick={() => onRemove(item)} aria-label={`Remover ${item.title}`}><Trash2 /></button></div>
    </li>;
  })}</ol></>;
}

function QueueThumbnail({ item }: { item: QueueItem }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <div className="queue-thumb">{item.thumbnail && failedUrl !== item.thumbnail ? <img src={item.thumbnail} alt="" width="96" height="54" loading="lazy" onError={() => setFailedUrl(item.thumbnail)} /> : <Library aria-hidden="true" />}</div>;
}

function HistoryList({ history: items }: { history: HouseHistoryEntry[] }) {
  return <div className="history-panel"><div><History size={18} aria-hidden="true" /><strong>Reproduzidos recentemente</strong></div>{items.length ? <ul>{items.slice().reverse().map((item) => <li key={`${item.id}-history`}><span>{item.title}</span><small>{providerLabel(item.provider)} · {timeLabel(item.playedAt)}</small></li>)}</ul> : <p>Nenhuma mídia reproduzida ainda.</p>}</div>;
}

function ChatPanel({ messages, currentUser, typingNames, onTyping, onSend }: { messages: ChatMessage[]; currentUser: User; typingNames: string[]; onTyping: (typing: boolean) => void; onSend: (body: string) => boolean }) {
  const [draft, setDraft] = useState("");
  const [newBelow, setNewBelow] = useState(0);
  const timer = useRef<number>();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const lastMessageId = useRef(messages.at(-1)?.id);
  const typingSent = useRef(false);
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus(); return () => { window.clearTimeout(timer.current); if (typingSent.current) onTypingRef.current(false); }; }, []);
  useEffect(() => {
    const nextId = messages.at(-1)?.id;
    if (nextId === lastMessageId.current) return;
    lastMessageId.current = nextId;
    if (atBottom.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    else setNewBelow((value) => value + 1);
  }, [messages]);
  const changed = (value: string) => {
    setDraft(value);
    if (value.trim() && !typingSent.current) { onTyping(true); typingSent.current = true; }
    if (!value.trim() && typingSent.current) { onTyping(false); typingSent.current = false; }
    window.clearTimeout(timer.current);
    if (value.trim()) timer.current = window.setTimeout(() => { onTypingRef.current(false); typingSent.current = false; }, 1400);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.trim() && onSend(draft)) { setDraft(""); if (typingSent.current) onTyping(false); typingSent.current = false; window.clearTimeout(timer.current); } };
  return <div className="chat-panel"><div ref={listRef} className="messages" onScroll={(event) => { const node = event.currentTarget; atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72; if (atBottom.current) setNewBelow(0); }}>
    {messages.length ? messages.map((message) => <article className={`message ${message.user.id === currentUser.id ? "mine" : ""}`} key={message.id}><Avatar className="message-avatar" name={message.user.displayName} src={message.user.avatar} color={message.user.color} /><div><header><strong>{message.user.displayName}</strong><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></header><p>{message.body}</p></div></article>) : <p className="chat-empty">Nenhuma mensagem ainda.</p>}
  </div>{newBelow ? <button className="chat-new-below" onClick={() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); atBottom.current = true; setNewBelow(0); }}>Novas mensagens ↓</button> : null}<div className="typing-indicator" aria-live="polite">{typingNames.length ? `${typingNames.slice(0, 2).join(" e ")} está digitando…` : ""}</div><form className="chat-form" onSubmit={submit}><label className="sr-only" htmlFor="chat-message">Mensagem</label><input ref={inputRef} id="chat-message" name="message" autoComplete="off" value={draft} onChange={(event) => changed(event.target.value)} placeholder="Escreva uma mensagem…" /><button disabled={!draft.trim()} aria-label="Enviar mensagem"><Send /></button></form></div>;
}

function MembersPanel({ members, currentUserId, participantVolumes, onVolume }: { members: HouseMember[]; currentUserId: string; participantVolumes: Record<string, number>; onVolume: (userId: string, volume: number) => void }) {
  const sections = [{ label: "Na Party", items: members.filter((m) => m.inParty) }, { label: "Online", items: members.filter((m) => !m.inParty && m.presence !== "OFFLINE") }, { label: "Offline", items: members.filter((m) => m.presence === "OFFLINE") }];
  return <div className="members-panel"><div className="members-summary"><Users size={20} aria-hidden="true" /><div><strong>{members.filter((m) => m.presence !== "OFFLINE").length} online</strong><span>{members.length} membros na Casa</span></div></div>{sections.map((section) => section.items.length ? <section className="people-section" key={section.label}><h3>{section.label} · {section.items.length}</h3><ul className="members-list">{section.items.map((member) => <li className={`member-row ${member.speaking ? "is-speaking" : ""} ${member.presence === "OFFLINE" ? "is-offline" : ""}`} key={member.user.id}><Avatar className="member-avatar" name={member.user.displayName} src={member.user.avatar} color={member.user.color} /><div className="member-copy"><div><strong>{member.user.displayName}{member.user.id === currentUserId ? " (você)" : ""}</strong>{member.role !== "MEMBER" ? <span className="role-badge">{member.role === "HOST" ? "Host" : "Admin"}</span> : null}</div><span>{member.screenSharing ? "Compartilhando tela" : member.speaking ? "Falando" : member.inCall ? "Na call" : member.inParty ? "Na Party" : member.presence === "IDLE" ? "Ausente" : member.presence === "OFFLINE" ? `Visto ${timeLabel(member.lastSeenAt)}` : member.user.status || "Online"}</span>{member.inCall && member.user.id !== currentUserId ? <label className="participant-volume"><span className="sr-only">Volume de {member.user.displayName}</span><Volume2 size={14} /><input type="range" min="0" max="100" value={participantVolumes[member.user.id] ?? 80} onChange={(event) => onVolume(member.user.id, Number(event.target.value))} /></label> : null}</div>{member.screenSharing ? <MonitorUp size={17} /> : member.speaking ? <span className="speaking-bars"><i /><i /><i /></span> : <span className="online-dot" />}</li>)}</ul></section> : null)}</div>;
}

function RoomSettingsDialog({ settings, onClose, onSave }: { settings: RoomSettings; onClose: () => void; onSave: (settings: RoomSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><h2 id="settings-title">Configurações da Party</h2><p>Defina quem pode controlar a mídia e a fila.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar configurações"><X /></button></header><label>Controle da mídia<select value={draft.mediaControl} onChange={(event) => setDraft((current) => ({ ...current, mediaControl: event.target.value as RoomSettings["mediaControl"] }))}><option value="host">Somente Host</option><option value="host-moderators">Host e moderadores</option><option value="everyone">Todos</option></select></label><label>Adicionar à fila<select value={draft.queueControl} onChange={(event) => setDraft((current) => ({ ...current, queueControl: event.target.value as RoomSettings["queueControl"] }))}><option value="host">Somente Host</option><option value="members">Membros</option><option value="everyone">Todos</option></select></label><label className="settings-check"><input type="checkbox" checked={draft.skipVotingEnabled} onChange={(event) => setDraft((current) => ({ ...current, skipVotingEnabled: event.target.checked }))} /> Ativar votação para pular</label><label>Limite de votos: {draft.skipVoteThreshold}%<input type="range" min="10" max="100" step="10" value={draft.skipVoteThreshold} disabled={!draft.skipVotingEnabled} onChange={(event) => setDraft((current) => ({ ...current, skipVoteThreshold: Number(event.target.value) }))} /></label><button className="primary-action" onClick={() => onSave(draft)}>Salvar configurações</button></section></div>;
}
