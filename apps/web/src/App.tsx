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
} from "@lumio/shared";
import type { MainStageView } from "./components/MainStage";
import type { LocalAudioSettings } from "./components/CallSettings";
import { expectedPosition } from "./media/MediaProvider";
import { toQueueItem } from "./media/MediaResolver";
import { HouseSettingsDialog, InviteDialog, ProfileDialog } from "./components/SocialDialogs";
import { Avatar } from "./components/Avatar";
import { AuthPage, BootstrapPage, HomePage, InvitePage, LandingPage } from "./components/EntryExperience";

const MediaHub = lazy(() => import("./components/MediaHub").then((module) => ({ default: module.MediaHub })));
const MediaStage = lazy(() => import("./components/MediaStage").then((module) => ({ default: module.MediaStage })));
const MainStage = lazy(() => import("./components/MainStage").then((module) => ({ default: module.MainStage })));
const CallSettings = lazy(() => import("./components/CallSettings").then((module) => ({ default: module.CallSettings })));

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
const isEditableTarget = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], button, [role="slider"]')); };

export function App() {
  const [session, setSession] = useState<SessionData | null>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as SessionData | null; } catch { return null; }
  });
  const [authStatus, setAuthStatus] = useState<"unknown" | "authenticated" | "unauthenticated">(() => localStorage.getItem(SESSION_KEY) ? "unknown" : "unauthenticated");
  const [path, setPath] = useState(() => `${window.location.pathname}${window.location.search}`);
  const [bootstrapError, setBootstrapError] = useState("");
  const [housesError, setHousesError] = useState("");
  const [houses, setHouses] = useState<HouseSummary[]>([]);
  const [currentHouseId, setCurrentHouseId] = useState(() => localStorage.getItem(HOUSE_KEY) ?? "");
  const [house, setHouse] = useState<HouseDetails | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  const [authError, setAuthError] = useState("");
  const [reaction, setReaction] = useState<{ id: string; emoji: string; user: User } | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);
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
  const pendingIceCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const analyserCleanup = useRef<(() => void) | null>(null);
  const displayStream = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  const deafenedRef = useRef(deafened);
  const audioSettingsRef = useRef(audioSettings);
  const participantVolumesRef = useRef(participantVolumes);
  const shortcutActions = useRef<{ toggleDeafen?: () => void; toggleTheater?: () => void }>({});
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
  useEffect(() => { localStorage.setItem("lumio.audio.v1", JSON.stringify(audioSettings)); }, [audioSettings]);
  useEffect(() => { localStorage.setItem("lumio.presentation.v1", presentationMode); }, [presentationMode]);

  const authHeaders = session ? { Authorization: `Bearer ${session.token}` } : undefined;
  const refreshHouses = useCallback(async () => {
    if (!session) return;
    setHousesError("");
    let response: Response; try { response = await fetch(`${API_URL}/api/houses`, { headers: authHeaders }); } catch { setHousesError("Não foi possível carregar suas Casas."); return; }
    if (response.status === 401) { localStorage.removeItem(SESSION_KEY); setSession(null); setSnapshot(null); setAuthStatus("unauthenticated"); return; } if (!response.ok) { setHousesError("Não foi possível carregar suas Casas."); return; }
    const data = await response.json() as { houses: HouseSummary[] }; setHouses(data.houses);
    const selected = data.houses.find((item) => item.id === currentHouseId) ?? data.houses[0];
    if (selected && selected.id !== currentHouseId) { setCurrentHouseId(selected.id); localStorage.setItem(HOUSE_KEY, selected.id); }
  }, [session?.token, currentHouseId]);
  useEffect(() => { if (authStatus === "authenticated") void refreshHouses(); }, [authStatus, refreshHouses]);
  useEffect(() => { if (authStatus !== "authenticated" || routeHouseId || inviteToken) return; const timer = window.setInterval(() => void refreshHouses(), 20_000); return () => window.clearInterval(timer); }, [authStatus, routeHouseId, inviteToken, refreshHouses]);

  useEffect(() => { if (!routeHouseId || !houses.length) return; setCurrentHouseId(routeHouseId); localStorage.setItem(HOUSE_KEY, routeHouseId); }, [routeHouseId, houses.length]);

  const selectedHouse = houses.find((item) => item.id === currentHouseId);
  useEffect(() => { if (routeHouseId && selectedHouse) document.title = `${selectedHouse.name} — Lumio`; }, [routeHouseId, selectedHouse?.name]);

  useEffect(() => {
    if (!session || !routeHouseId || !selectedHouse || selectedHouse.id !== routeHouseId) return;
    const nextSocket: TypedSocket = io(SOCKET_URL, { auth: { token: session.token }, transports: ["websocket", "polling"] });
    setSocket(nextSocket);
    setConnectionState("connecting");
    nextSocket.on("connect", () => { setConnectionState("connected"); nextSocket.emit(eventNames.roomJoin, { roomId: selectedHouse.primaryRoomId, user: session.user }); });
    nextSocket.on("disconnect", () => setConnectionState("offline"));
    nextSocket.on("connect_error", (error) => {
      setConnectionState("offline");
      if (error.message.toLowerCase().includes("sessão inválida")) {
        localStorage.removeItem(SESSION_KEY);
        setAuthError("Sua sessão expirou. Entre novamente para continuar.");
        setSession(null);
      }
    });
    nextSocket.on("room:snapshot", (nextSnapshot) => { setSnapshot(nextSnapshot); setPlayerResyncToken((value) => value + 1); });
    nextSocket.on("presence:update", (members) => setSnapshot((current) => current ? { ...current, members, connectedCount: members.length } : current));
    nextSocket.on("queue:update", (queue, queueRevision) => setSnapshot((current) => current ? { ...current, queue, queueRevision } : current));
    nextSocket.on("queue:history", (historyItems) => setSnapshot((current) => current ? { ...current, history: historyItems } : current));
    nextSocket.on("room:mode", (mode) => setSnapshot((current) => current ? { ...current, mode } : current));
    nextSocket.on("room:settings", (settings) => setSnapshot((current) => current ? { ...current, settings } : current));
    nextSocket.on("vote:skip", (vote) => setSnapshot((current) => current ? { ...current, skipVote: { count: vote.count, required: vote.required, votedBy: vote.votedBy } } : current));
    nextSocket.on("media:sync", (media) => { setSnapshot((current) => current && media.revision >= current.currentMedia.revision ? { ...current, currentMedia: media } : current); setPlayerResyncToken((value) => value + 1); });
    nextSocket.on("chat:message", (message) => setSnapshot((current) => current ? { ...current, messages: [...current.messages, message].slice(-80) } : current));
    nextSocket.on("chat:typing", ({ userId, typing }) => setTypingUserIds((current) => typing ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));
    nextSocket.on("reaction:send", (value) => { setReaction(value); window.setTimeout(() => setReaction(null), 2200); });
    nextSocket.on("screen:state", (state) => { setSnapshot((current) => current ? { ...current, screenShare: state } : current); if (state) setStageView("screen"); else { setStageView("media"); setRemoteScreenStream(null); } });
    nextSocket.on("house:update", (nextHouse) => { if (nextHouse.id === currentHouseId) setHouse(nextHouse); void refreshHouses(); });
    nextSocket.on("media-hub:update", ({ houseId }) => { if (houseId === currentHouseId) setMediaHubRevision((value) => value + 1); });
    nextSocket.on("member:removed", ({ houseId, message }) => { if (houseId !== currentHouseId) return; setVoiceError(message); setSnapshot(null); localStorage.removeItem(HOUSE_KEY); setCurrentHouseId(""); void refreshHouses(); });
    nextSocket.on("server:error", (message) => setVoiceError(message));
    return () => { nextSocket.disconnect(); setSocket(null); };
  }, [session, routeHouseId, selectedHouse?.id, selectedHouse?.primaryRoomId]);

  useEffect(() => {
    if (!session || !routeHouseId || !currentHouseId) return;
    fetch(`${API_URL}/api/houses/${currentHouseId}`, { headers: authHeaders }).then(async (response) => { if (response.ok) setHouse((await response.json() as { house: HouseDetails }).house); }).catch(() => undefined);
  }, [session?.token, routeHouseId, currentHouseId]);

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

  useEffect(() => {
    if (!routeHouseId || !navigator.mediaDevices?.enumerateDevices) return;
    const refresh = () => void navigator.mediaDevices.enumerateDevices().then((devices) => setAudioDevices(devices.filter((device) => device.kind === "audioinput" || device.kind === "audiooutput"))).catch(() => undefined);
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
  }, [routeHouseId]);

  useEffect(() => {
    remoteAudio.current.forEach((audio, userId) => {
      audio.volume = ((participantVolumes[userId] ?? 80) / 100) * (audioSettings.callVolume / 100);
      audio.muted = deafened;
      if (audioSettings.outputDeviceId && "setSinkId" in audio) void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioSettings.outputDeviceId).catch(() => undefined);
    });
  }, [audioSettings.callVolume, audioSettings.outputDeviceId, deafened, participantVolumes]);

  useEffect(() => {
    const roomId = snapshot?.id;
    if (!socket || !roomId || !session || !window.RTCPeerConnection) return;
    const createPeerConnection = (peerId: string) => {
      const existing = peerConnections.current.get(peerId);
      if (existing) return existing;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current!));
      displayStream.current?.getVideoTracks().forEach((track) => connection.addTrack(track, displayStream.current!));
      if (!localStream.current?.getAudioTracks().length) connection.addTransceiver("audio", { direction: "recvonly" });
      if (!displayStream.current?.getVideoTracks().length) connection.addTransceiver("video", { direction: "recvonly" });
      connection.onicecandidate = (event) => { if (event.candidate) socket.emit(eventNames.voiceSignal, { roomId, targetUserId: peerId, signal: { candidate: event.candidate.toJSON() } }); };
      connection.ontrack = (event) => {
        const stream = event.streams[0]; if (!stream) return;
        if (event.track.kind === "video") {
          const videoStream = new MediaStream([event.track]);
          setRemoteScreenStream(videoStream); setStageView("screen");
          event.track.addEventListener("ended", () => setRemoteScreenStream((current) => current === videoStream ? null : current), { once: true });
          return;
        }
        const audio = remoteAudio.current.get(peerId) ?? new Audio();
        audio.autoplay = true; audio.srcObject = stream; audio.volume = ((participantVolumesRef.current[peerId] ?? 80) / 100) * (audioSettingsRef.current.callVolume / 100); audio.muted = deafenedRef.current;
        if (audioSettingsRef.current.outputDeviceId && "setSinkId" in audio) void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioSettingsRef.current.outputDeviceId).catch(() => undefined);
        remoteAudio.current.set(peerId, audio); void audio.play().catch(() => undefined);
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") setVoiceError("");
        if (connection.connectionState === "failed") {
          setVoiceError("Conexão instável; tentando recuperar a call…");
          connection.restartIce();
          void connection.createOffer({ iceRestart: true }).then(async (offer) => { await connection.setLocalDescription(offer); socket.emit(eventNames.voiceSignal, { roomId, targetUserId: peerId, signal: offer }); }).catch(() => undefined);
        }
        if (connection.connectionState === "disconnected") setVoiceError("Reconectando áudio da call…");
        if (connection.connectionState !== "closed") return;
        peerConnections.current.delete(peerId);
        const audio = remoteAudio.current.get(peerId); audio?.pause(); if (audio) audio.srcObject = null; remoteAudio.current.delete(peerId);
      };
      peerConnections.current.set(peerId, connection);
      return connection;
    };
    const onPeerJoined = async (peer: User) => {
      if (peer.id === session.user.id) return;
      const connection = createPeerConnection(peer.id); const offer = await connection.createOffer();
      await connection.setLocalDescription(offer); socket.emit(eventNames.voiceSignal, { roomId, targetUserId: peer.id, signal: offer });
    };
    const onSignal = async (payload: { fromUserId: string; signal: unknown }) => {
      if (payload.fromUserId === session.user.id) return;
      const connection = createPeerConnection(payload.fromUserId);
      const signal = payload.signal as { type?: string; candidate?: RTCIceCandidateInit };
      const flushCandidates = async () => { const pending = pendingIceCandidates.current.get(payload.fromUserId) ?? []; for (const candidate of pending) await connection.addIceCandidate(candidate); pendingIceCandidates.current.delete(payload.fromUserId); };
      if (signal.type === "offer") { await connection.setRemoteDescription(signal as RTCSessionDescriptionInit); await flushCandidates(); const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); socket.emit(eventNames.voiceSignal, { roomId, targetUserId: payload.fromUserId, signal: answer }); }
      else if (signal.type === "answer") { await connection.setRemoteDescription(signal as RTCSessionDescriptionInit); await flushCandidates(); }
      else if (signal.candidate) {
        if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
        else pendingIceCandidates.current.set(payload.fromUserId, [...(pendingIceCandidates.current.get(payload.fromUserId) ?? []), signal.candidate]);
      }
    };
    const onPeerLeft = (peerId: string) => {
      peerConnections.current.get(peerId)?.close(); peerConnections.current.delete(peerId);
      pendingIceCandidates.current.delete(peerId);
      const audio = remoteAudio.current.get(peerId); audio?.pause(); if (audio) audio.srcObject = null; remoteAudio.current.delete(peerId);
    };
    socket.on("voice:peer-joined", onPeerJoined); socket.on("voice:signal", onSignal); socket.on("voice:peer-left", onPeerLeft);
    return () => { socket.off("voice:peer-joined", onPeerJoined); socket.off("voice:signal", onSignal); socket.off("voice:peer-left", onPeerLeft); };
  }, [session, snapshot?.id, socket]);

  useEffect(() => {
    if (!routeHouseId) return;
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowMediaHub(false); setShowHouseSettings(false); setShowInvite(false); setShowProfile(false); setShowCallSettings(false); setShowMainMenu(false); setShowProfileMenu(false); setRightPanelCollapsed(true); setTheaterMode(false); return; }
      if (isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() === "d") shortcutActions.current.toggleDeafen?.();
      if (event.key.toLowerCase() === "t") shortcutActions.current.toggleTheater?.();
      if (event.key === "/") { event.preventDefault(); setShowMediaHub(true); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [routeHouseId]);

  const authenticate = async (mode: "signup" | "login", input: { displayName: string; email: string; password: string }) => {
    setAuthError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json() as SessionData & { message?: string };
      if (!response.ok) { setAuthError(data.message ?? "Não foi possível entrar."); return; }
      localStorage.setItem(SESSION_KEY, JSON.stringify(data)); setSession(data); setHouses([]); setAuthStatus("authenticated");
      const next = new URLSearchParams(path.split("?")[1] ?? "").get("next"); navigate(next?.startsWith("/") ? next : "/app");
    } catch { setAuthError("Não foi possível alcançar o servidor. Verifique se a API está rodando."); }
  };
  const logout = () => {
    if (session) void fetch(`${API_URL}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } });
    socket?.disconnect(); analyserCleanup.current?.(); localStream.current?.getTracks().forEach((track) => track.stop()); displayStream.current?.getTracks().forEach((track) => track.stop()); peerConnections.current.forEach((connection) => connection.close()); remoteAudio.current.forEach((audio) => { audio.pause(); audio.srcObject = null; });
    localStorage.removeItem(SESSION_KEY); localStorage.removeItem(HOUSE_KEY); setSession(null); setHouses([]); setHouse(null); setSnapshot(null); setSocket(null); setMicEnabled(false); setLocalScreenStream(null); setRemoteScreenStream(null); setAuthStatus("unauthenticated"); navigate("/");
  };

  const sendChat = (body: string) => { if (body.trim() && snapshot) socket?.emit(eventNames.chatMessage, { roomId: snapshot.id, body }); };
  const sendReaction = (emoji: string) => { if (snapshot) socket?.emit(eventNames.reactionSend, { roomId: snapshot.id, emoji }); };
  const voteToSkip = () => { if (snapshot) socket?.emit(eventNames.voteSkip, { roomId: snapshot.id }); };
  const nextMedia = () => { if (snapshot) socket?.emit(eventNames.queueNext, { roomId: snapshot.id }); };
  const previousMedia = () => { if (snapshot) socket?.emit(eventNames.queuePrevious, { roomId: snapshot.id }); };
  const moveQueueItem = (itemId: string, toIndex: number) => {
    if (!snapshot || !socket) return;
    const previous = snapshot.queue; const fromIndex = previous.findIndex((item) => item.id === itemId); if (fromIndex < 0) return;
    const optimistic = [...previous]; const [item] = optimistic.splice(fromIndex, 1); optimistic.splice(Math.max(0, Math.min(toIndex, optimistic.length)), 0, item);
    setSnapshot({ ...snapshot, queue: optimistic }); socket.emit(eventNames.queueMove, { roomId: snapshot.id, itemId, toIndex, revision: snapshot.queueRevision });
  };
  const sendPlaybackCommand = useCallback((command: { action: "play" | "pause" | "seek" | "rate"; position: number; playbackRate?: number }) => {
    if (!socket || !snapshot || !snapshot.currentMedia.mediaId) return;
    const event = command.action === "play" ? eventNames.mediaPlay : command.action === "pause" ? eventNames.mediaPause : command.action === "seek" ? eventNames.mediaSeek : eventNames.mediaRate;
    socket.emit(event, { roomId: snapshot.id, mediaId: snapshot.currentMedia.mediaId, revision: snapshot.currentMedia.revision, operationId: crypto.randomUUID(), position: command.position, playbackRate: command.playbackRate });
  }, [socket, snapshot?.id, snapshot?.currentMedia.mediaId, snapshot?.currentMedia.revision]);
  const addMedia = (media: MediaItem, playNow = false) => {
    if (!socket || !snapshot || !session) return;
    const item = toQueueItem(media, session.user);
    socket.emit(eventNames.queueAdd, { roomId: snapshot.id, item }, (result) => {
      if (!result.ok || !result.item) { setVoiceError(result.message ?? "Não foi possível adicionar à fila."); return; }
      if (playNow || snapshot.queue.length === 0 || !snapshot.currentMedia.mediaId) socket.emit(eventNames.mediaChange, { roomId: snapshot.id, item: result.item });
    });
  };
  const playMediaNext = (media: MediaItem) => {
    if (!socket || !snapshot || !session) return;
    socket.emit(eventNames.queuePlayNext, { roomId: snapshot.id, item: toQueueItem(media, session.user), revision: snapshot.queueRevision }, (result) => { if (!result.ok) setVoiceError(result.message ?? "Não foi possível alterar a fila."); });
  };
  const clearQueue = () => {
    if (!socket || !snapshot) return;
    socket.emit(eventNames.queueClear, { roomId: snapshot.id, revision: snapshot.queueRevision }, (result) => { if (!result.ok) setVoiceError(result.message ?? "Não foi possível limpar a fila."); });
    setConfirmClearQueue(false);
  };

  const handleProviderEnded = useCallback(() => { if (socket && snapshot) socket.emit(eventNames.queueAdvance, { roomId: snapshot.id, expectedMediaId: snapshot.currentMedia.mediaId, revision: snapshot.queueRevision }); }, [socket, snapshot?.id, snapshot?.currentMedia.mediaId, snapshot?.queueRevision]);

  const renegotiatePeers = useCallback(() => {
    if (!socket || !snapshot) return;
    peerConnections.current.forEach((connection, peerId) => {
      void connection.createOffer().then(async (offer) => { await connection.setLocalDescription(offer); socket.emit(eventNames.voiceSignal, { roomId: snapshot.id, targetUserId: peerId, signal: offer }); }).catch(() => setVoiceError("Não foi possível atualizar a conexão da call."));
    });
  }, [socket, snapshot?.id]);

  const startMicMeter = useCallback((stream: MediaStream) => {
    analyserCleanup.current?.();
    const audioContext = new AudioContext(); const analyser = audioContext.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .75;
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
  }, [socket, snapshot?.id]);

  const toggleMic = async () => {
    if (!snapshot) return;
    if (micEnabled) {
      localStream.current?.getTracks().forEach((track) => track.stop()); analyserCleanup.current?.(); analyserCleanup.current = null; localStream.current = null;
      setMicEnabled(false); setSpeaking(false); socket?.emit(eventNames.voiceLeave, { roomId: snapshot.id }); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: true, deafened }); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { setVoiceError("Este navegador não oferece acesso ao microfone."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: audioSettings.inputDeviceId ? { exact: audioSettings.inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const shouldMute = deafened || audioSettings.microphoneMode === "ptt"; stream.getAudioTracks().forEach((track) => { track.enabled = !shouldMute; });
      localStream.current = stream; setMicEnabled(true); setMuted(shouldMute); setVoiceError(""); startMicMeter(stream);
      peerConnections.current.forEach((connection) => stream.getAudioTracks().forEach((track) => connection.addTrack(track, stream))); renegotiatePeers();
      socket?.emit(eventNames.voiceJoin, { roomId: snapshot.id }); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: shouldMute, deafened });
      void navigator.mediaDevices.enumerateDevices().then((devices) => setAudioDevices(devices.filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")));
    } catch { setVoiceError("Não foi possível acessar o microfone. Revise a permissão do navegador."); }
  };
  const toggleMute = () => {
    if (!micEnabled) return void toggleMic();
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
    renegotiatePeers();
  }, [renegotiatePeers, socket, snapshot?.id]);

  const startScreenShare = async () => {
    if (!socket || !snapshot || !navigator.mediaDevices?.getDisplayMedia) { setVoiceError("Compartilhamento de tela não é suportado neste navegador."); return; }
    try {
      // Capture must begin inside the click activation; room authority is claimed immediately after selection.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: false });
      socket.emit(eventNames.screenStart, { roomId: snapshot.id }, (result) => {
        if (!result.ok) { stream.getTracks().forEach((track) => track.stop()); setVoiceError(result.message ?? "Outra pessoa já está compartilhando a tela."); return; }
        displayStream.current = stream; setLocalScreenStream(stream); setStageView("screen"); setVoiceError("");
        peerConnections.current.forEach((connection) => stream.getVideoTracks().forEach((track) => connection.addTrack(track, stream)));
        stream.getVideoTracks()[0]?.addEventListener("ended", () => stopScreenShare(true), { once: true }); renegotiatePeers();
      });
    } catch { setVoiceError("O compartilhamento de tela foi cancelado."); }
  };

  useEffect(() => {
    if (!micEnabled || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    void navigator.mediaDevices.getUserMedia({ audio: { deviceId: audioSettings.inputDeviceId ? { exact: audioSettings.inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      const previous = localStream.current; const nextTrack = stream.getAudioTracks()[0];
      const shouldMute = deafenedRef.current || audioSettingsRef.current.microphoneMode === "ptt"; nextTrack.enabled = !shouldMute;
      peerConnections.current.forEach((connection) => { const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "audio"); if (sender) void sender.replaceTrack(nextTrack); else connection.addTrack(nextTrack, stream); });
      previous?.getTracks().forEach((track) => track.stop()); localStream.current = stream; startMicMeter(stream); setMuted(shouldMute); setVoiceError("");
    }).catch(() => setVoiceError("Não foi possível trocar o microfone. O dispositivo anterior continua selecionado."));
    return () => { cancelled = true; };
    // Device replacement should run only when the selected input changes.
  }, [audioSettings.inputDeviceId]);

  useEffect(() => {
    if (!micEnabled || !snapshot) return;
    const tracks = localStream.current?.getAudioTracks() ?? [];
    if (audioSettings.microphoneMode === "voice") {
      const nextMuted = deafened; tracks.forEach((track) => { track.enabled = !nextMuted; }); setMuted(nextMuted);
      socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: nextMuted, deafened });
      return;
    }
    tracks.forEach((track) => { track.enabled = false; }); setMuted(true);
    const isEditable = (target: EventTarget | null) => { const node = target as HTMLElement | null; return Boolean(node && (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) || node.isContentEditable)); };
    const onDown = (event: KeyboardEvent) => { if (event.code !== "KeyV" || event.repeat || isEditable(event.target) || deafenedRef.current) return; event.preventDefault(); tracks.forEach((track) => { track.enabled = true; }); mutedRef.current = false; setMuted(false); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: false, deafened: false }); };
    const release = (event?: Event) => { if (event instanceof KeyboardEvent && event.code !== "KeyV") return; tracks.forEach((track) => { track.enabled = false; }); mutedRef.current = true; setMuted(true); setSpeaking(false); socket?.emit(eventNames.presenceUpdate, { roomId: snapshot.id, speaking: false, muted: true, deafened: deafenedRef.current }); };
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", release); window.addEventListener("blur", release);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", release); window.removeEventListener("blur", release); };
  }, [audioSettings.microphoneMode, deafened, micEnabled, snapshot?.id, socket]);

  useEffect(() => {
    if (!micEnabled) { setCallQuality("Calculando"); return; }
    const inspect = async () => {
      let worstRtt = 0; let received = 0; let lost = 0;
      await Promise.all([...peerConnections.current.values()].map(async (connection) => {
        const reports = await connection.getStats(); reports.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") worstRtt = Math.max(worstRtt, report.currentRoundTripTime);
          if (report.type === "inbound-rtp" && report.kind === "audio") { received += Number(report.packetsReceived ?? 0); lost += Number(report.packetsLost ?? 0); }
        });
      }));
      if (!peerConnections.current.size) { setCallQuality("Calculando"); return; }
      const loss = lost / Math.max(1, received + lost); setCallQuality(worstRtt < .15 && loss < .02 ? "Excelente" : worstRtt < .35 && loss < .06 ? "Boa" : "Instável");
    };
    void inspect(); const timer = window.setInterval(() => void inspect(), 8_000); return () => window.clearInterval(timer);
  }, [micEnabled]);

  shortcutActions.current = { toggleDeafen, toggleTheater: () => setTheaterMode((value) => !value) };

  const openHouse = (target: HouseSummary) => { setSnapshot(null); setHouse(null); setCurrentHouseId(target.id); localStorage.setItem(HOUSE_KEY, target.id); navigate(`/house/${encodeURIComponent(target.id)}`); };
  const createHomeHouse = async (name: string) => { if (!session) return; const response = await fetch(`${API_URL}/api/houses`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); if (!response.ok) { setHousesError((await response.json()).message ?? "Não foi possível criar a Casa."); return; } const data = await response.json() as { house: HouseDetails }; await refreshHouses(); openHouse(data.house); };
  const openInviteInput = () => { const value = window.prompt("Cole o link ou código do convite"); if (!value?.trim()) return; const token = value.includes("/invite/") ? value.split("/invite/")[1]?.split(/[?#]/)[0] : value.includes("?invite=") ? new URL(value).searchParams.get("invite") : value.trim(); if (token) navigate(`/invite/${encodeURIComponent(token)}`); };
  const acceptedInvite = async (houseId: string) => { await refreshHouses(); setCurrentHouseId(houseId); localStorage.setItem(HOUSE_KEY, houseId); setHouse(null); setSnapshot(null); navigate(`/house/${encodeURIComponent(houseId)}`); };

  if (authStatus === "unknown") return <BootstrapPage error={bootstrapError} onRetry={() => void bootstrap()} />;
  if (!session || authStatus === "unauthenticated") {
    if (inviteToken) return <InvitePage apiUrl={API_URL} token={inviteToken} session={null} navigate={navigate} onAccepted={async () => undefined} />;
    if (pathname === "/login" || pathname === "/register") return <AuthPage key={pathname} mode={pathname === "/login" ? "login" : "register"} error={authError} onSubmit={(data) => authenticate(pathname === "/login" ? "login" : "signup", data)} navigate={navigate} />;
    return <LandingPage navigate={navigate} />;
  }
  if (inviteToken) return <InvitePage apiUrl={API_URL} token={inviteToken} session={session} navigate={navigate} onAccepted={acceptedInvite} />;
  if (!routeHouseId) return <HomePage user={session.user} houses={houses} error={housesError} onRetry={() => void refreshHouses()} onOpenHouse={openHouse} onCreate={createHomeHouse} onInvite={openInviteInput} onLogout={logout} />;
  if (!houses.some((item) => item.id === routeHouseId)) return <main className="loading-screen"><span className="brand-symbol">L</span><h1>Casa indisponível</h1><p>Você não faz parte desta Casa.</p><button onClick={() => navigate("/app")}>Voltar para suas Casas</button></main>;
  if (!snapshot) return <LoadingScreen user={session.user} connectionState={connectionState} onLogout={logout} />;

  const currentGroup = selectedHouse;
  const currentQueueItem = snapshot.queue.find((item) => item.provider === snapshot.currentMedia.provider && item.providerMediaId === snapshot.currentMedia.mediaId);
  const canManage = Boolean(house?.permissions.includes("HOUSE_MANAGE") || house?.permissions.includes("MEMBER_MANAGE"));
  const anotherMemberSpeaking = snapshot.members.some((member) => member.user.id !== session.user.id && member.speaking);
  const mediaVolume = audioSettings.duckingEnabled && anotherMemberSpeaking ? Math.min(audioSettings.mediaVolume, audioSettings.duckingVolume) : audioSettings.mediaVolume;
  const isSharingScreen = snapshot.screenShare?.user.id === session.user.id;
  const switchHouse = (id: string) => { const target = houses.find((item) => item.id === id); if (target) openHouse(target); setShowMainMenu(false); };
  const createHouse = async () => { const name = window.prompt("Nome da nova Casa"); if (!name?.trim()) return; await createHomeHouse(name); };
  const openDrawer = (panel: "chat" | "members" | "queue") => { setActivePanel(panel); setRightPanelCollapsed(false); };
  const micLabel = !micEnabled ? "Entrar na call" : muted ? "Ativar microfone" : "Desativar microfone";
  const syncLabel = connectionState === "connected" ? "Sincronizado com a Party" : connectionState === "connecting" ? "Sincronizando com a Party" : "Conexão perdida — tentando reconectar";

  return <Suspense fallback={<LoadingScreen user={session.user} connectionState="connecting" onLogout={logout} />}><div className={`app-shell ${rightPanelCollapsed ? "panel-collapsed" : ""} ${theaterMode ? "theater-shell" : ""}`}>
    <a className="skip-link" href="#party-content">Ir para o conteúdo principal</a>
    <main className="party-main" id="party-content">
      <header className="party-header">
        <div className="header-identity">
          <button className="brand-menu-trigger" onClick={() => { setShowMainMenu((value) => !value); setShowProfileMenu(false); }} aria-expanded={showMainMenu} aria-haspopup="menu"><span className="brand-symbol">L</span><span className="brand-name">Lumio</span><ChevronDown size={15} aria-hidden="true" /></button>
          {showMainMenu ? <nav className="main-menu-popover" aria-label="Menu principal"><strong>{currentGroup?.name ?? snapshot.groupName}</strong><button onClick={() => navigate("/app")}>Suas Casas</button>{houses.length > 1 ? <div className="house-switcher">{houses.map((item) => <button key={item.id} className={item.id === currentHouseId ? "active" : ""} onClick={() => switchHouse(item.id)}>{item.initials} · {item.name}<small>{item.onlineCount} online</small></button>)}</div> : null}<button className="active">Party</button><button onClick={() => { setShowMediaHub(true); setShowMainMenu(false); }}>Explorar mídia</button><button onClick={() => { setShowMediaHub(true); setShowMainMenu(false); }}><Library size={15} aria-hidden="true" /> Biblioteca</button><button onClick={() => { openDrawer("queue"); setShowHistory(true); setShowMainMenu(false); }}><Activity size={15} aria-hidden="true" /> Atividade</button>{canManage ? <button onClick={() => { setShowHouseSettings(true); setShowMainMenu(false); }}><Settings size={15} aria-hidden="true" /> Configurações da Casa</button> : null}<button onClick={() => void createHouse()}><Plus size={15} /> Criar Casa</button><span className="menu-rule" /><button onClick={() => setPresentationMode((value) => value === "video" ? "music" : "video")}><Sparkles size={15} aria-hidden="true" /> Visualização: {presentationMode === "music" ? "Ambiente" : "Vídeo"}</button><button onClick={() => setAmbientMode((value) => !value)}><Sparkles size={15} aria-hidden="true" /> Luz ambiente {ambientMode ? "ligada" : "desligada"}</button><button onClick={() => { setTheaterMode((value) => !value); setShowMainMenu(false); }}><Maximize2 size={15} aria-hidden="true" /> {theaterMode ? "Sair do modo cinema" : "Modo cinema"}</button></nav> : null}
          <span className="header-divider" aria-hidden="true" />
          <h1>{snapshot.groupName}</h1>
          <button className={`sync-dot ${connectionState}`} aria-label={syncLabel} data-tooltip={syncLabel}><span /></button>
        </div>
        <div className="header-actions"><button className="header-icon" onClick={() => openDrawer("members")} aria-label={`Abrir pessoas, ${house?.onlineCount ?? snapshot.members.length} online`} data-tooltip="Pessoas"><Users size={18} aria-hidden="true" /><span>{house?.onlineCount ?? snapshot.members.length}</span></button><button className="share-action" onClick={() => setShowInvite(true)}><Share2 size={17} aria-hidden="true" /> Convidar</button><div className="profile-anchor"><button className="header-avatar" onClick={() => { setShowProfileMenu((value) => !value); setShowMainMenu(false); }} aria-label="Abrir perfil" aria-expanded={showProfileMenu}><Avatar name={session.user.displayName} src={session.user.avatar} color={session.user.color} /></button>{showProfileMenu ? <div className="profile-popover"><strong>{session.user.displayName}</strong><small>{house?.role === "HOST" ? "Anfitrião" : house?.role === "ADMIN" ? "Admin" : "Membro"}</small>{session.user.status ? <small>{session.user.status}</small> : null}<button onClick={() => { setShowProfile(true); setShowProfileMenu(false); }}><Settings size={16} /> Editar perfil</button><button onClick={logout}><LogOut size={16} aria-hidden="true" /> Sair</button></div> : null}</div></div>
      </header>

      <div className={`party-workspace ${rightPanelCollapsed ? "" : "drawer-open"}`}>
        <section className="party-content">
          <MainStage screenShare={snapshot.screenShare} screenStream={isSharingScreen ? localScreenStream : remoteScreenStream} view={stageView} onViewChange={setStageView} media={<MediaStage media={snapshot.currentMedia} onSkip={nextMedia} onRemove={() => { if (currentQueueItem && window.confirm(`Remover “${currentQueueItem.title}” da fila?`)) socket?.emit(eventNames.queueRemove, { roomId: snapshot.id, itemId: currentQueueItem.id }); }} onAddMedia={() => setShowMediaHub(true)} onPlaybackCommand={sendPlaybackCommand} onEnded={handleProviderEnded} apiUrl={API_URL} token={session.token} theater={theaterMode} onTheaterChange={setTheaterMode} ambient={ambientMode} musicView={presentationMode === "music"} volume={audioSettings.mediaVolume} effectiveVolume={mediaVolume} onVolumeChange={(value) => setAudioSettings((current) => ({ ...current, mediaVolume: value }))} resyncToken={playerResyncToken} />} />
          {reaction ? <div className="reaction-float" key={reaction.id} aria-live="polite"><span>{reaction.emoji}</span><small>{reaction.user.displayName}</small></div> : null}
          {theaterMode ? <div className="theater-members" aria-label="Participantes">{snapshot.members.slice(0, 6).map((member) => <span key={member.user.id} className={member.speaking ? "speaking" : ""} title={member.user.displayName} style={{ background: member.user.color }}>{avatarLetters(member.user.displayName)}</span>)}</div> : null}

          <section className="now-playing" aria-labelledby="now-playing-title">
            <div className="now-playing-main"><span className="provider-badge">{providerLabel(snapshot.currentMedia.provider)}</span><div><p>Tocando agora</p><h2 id="now-playing-title">{snapshot.currentMedia.mediaId ? snapshot.currentMedia.title : "A Party está pronta"}</h2><span>{currentQueueItem ? `Adicionado por ${currentQueueItem.addedBy.displayName}` : "Escolha algo no Media Hub"}</span></div></div>
            {snapshot.currentMedia.mediaId ? <div className="party-media-actions"><div className="reaction-actions" aria-label="Reações">{["❤️", "😂", "👏", "🔥"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)} aria-label={`Enviar reação ${emoji}`} data-tooltip={`Reagir com ${emoji}`}>{emoji}</button>)}</div>{snapshot.settings.skipVotingEnabled ? <button className="skip-vote-action" onClick={voteToSkip} aria-label="Votar para pular" data-tooltip="Votar para pular"><SkipForward size={18} aria-hidden="true" /><span>{snapshot.skipVote.count}/{snapshot.skipVote.required}</span></button> : null}</div> : null}
          </section>
        </section>

        {!rightPanelCollapsed ? <aside className="party-drawer" aria-label="Painel da Party"><div className="drawer-header"><div className="drawer-tabs" role="tablist" aria-label="Conteúdo da Party"><button className={activePanel === "chat" ? "active" : ""} onClick={() => setActivePanel("chat")} role="tab" aria-selected={activePanel === "chat"}>Chat</button><button className={activePanel === "members" ? "active" : ""} onClick={() => setActivePanel("members")} role="tab" aria-selected={activePanel === "members"}>Pessoas</button><button className={activePanel === "queue" ? "active" : ""} onClick={() => setActivePanel("queue")} role="tab" aria-selected={activePanel === "queue"}>Fila</button></div><button className="icon-button" onClick={() => setRightPanelCollapsed(true)} aria-label="Fechar painel" data-tooltip="Fechar"><X size={18} /></button></div>{activePanel === "chat" ? <ChatPanel messages={snapshot.messages} currentUser={session.user} typingNames={(house?.members ?? []).filter((member) => typingUserIds.includes(member.user.id)).map((member) => member.user.displayName)} onTyping={(typing) => socket?.emit(eventNames.chatTyping, { roomId: snapshot.id, typing })} onSend={sendChat} /> : activePanel === "members" ? <MembersPanel members={house?.members ?? snapshot.houseMembers ?? []} currentUserId={session.user.id} participantVolumes={participantVolumes} onVolume={(userId, volume) => setParticipantVolumes((current) => ({ ...current, [userId]: volume }))} /> : <div className="drawer-queue"><div className="drawer-section-title"><div><strong>Fila da Party</strong><span>{snapshot.queue.length} {snapshot.queue.length === 1 ? "item" : "itens"} · rev. {snapshot.queueRevision}</span></div><div className="drawer-title-actions"><button className={showHistory ? "active" : ""} onClick={() => setShowHistory((value) => !value)} aria-label="Alternar histórico" data-tooltip="Histórico"><History size={17} /></button>{house?.permissions.includes("QUEUE_MANAGE") && snapshot.queue.length > 1 ? <button onClick={() => setConfirmClearQueue(true)} aria-label="Limpar fila" data-tooltip="Limpar fila"><Trash2 size={16} /></button> : null}</div></div>{showHistory ? <HistoryList history={snapshot.history} /> : null}<QueueList queue={snapshot.queue} currentKey={`${snapshot.currentMedia.provider}:${snapshot.currentMedia.mediaId}`} onPlay={(item) => socket?.emit(eventNames.mediaChange, { roomId: snapshot.id, item })} onRemove={(item) => { if (window.confirm(`Remover “${item.title}” da fila?`)) socket?.emit(eventNames.queueRemove, { roomId: snapshot.id, itemId: item.id }); }} onMove={moveQueueItem} onNext={nextMedia} onPrevious={previousMedia} onAdd={() => setShowMediaHub(true)} /></div>}</aside> : null}
      </div>

      <footer className="party-dock" aria-label="Controles da Party">
        {voiceError || micEnabled ? <span className={`dock-call-state ${voiceError ? "error" : "connected"}`} aria-live="polite"><i />{voiceError || (audioSettings.microphoneMode === "ptt" ? "Segure V para falar" : speaking ? "Você está falando" : `Voz conectada · ${callQuality}`)}</span> : null}
        <div className="dock-actions"><button className={`dock-button ${micEnabled && !muted ? "active" : ""} ${voiceError ? "error" : ""}`} onClick={() => micEnabled ? toggleMute() : void toggleMic()} aria-label={voiceError ? "Microfone indisponível" : micLabel} data-tooltip={voiceError ? "Microfone indisponível" : micLabel}>{muted && micEnabled ? <MicOff size={20} /> : <Mic size={20} />}</button><button className={`dock-button ${deafened ? "danger" : ""}`} onClick={toggleDeafen} aria-label={deafened ? "Ativar áudio" : "Desativar áudio"} data-tooltip={deafened ? "Ativar áudio" : "Desativar áudio"}><Headphones size={20} /></button><button className={`dock-button ${isSharingScreen ? "active" : ""}`} disabled={Boolean(snapshot.screenShare && !isSharingScreen)} onClick={() => isSharingScreen ? stopScreenShare(true) : void startScreenShare()} aria-label={isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"} data-tooltip={isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"}>{isSharingScreen ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />}</button><button className={`dock-button ${!rightPanelCollapsed && activePanel === "chat" ? "selected" : ""}`} onClick={() => !rightPanelCollapsed && activePanel === "chat" ? setRightPanelCollapsed(true) : openDrawer("chat")} aria-label="Abrir chat" data-tooltip="Chat"><MessageCircle size={20} /></button><button className={`dock-button ${!rightPanelCollapsed && activePanel === "queue" ? "selected" : ""}`} onClick={() => !rightPanelCollapsed && activePanel === "queue" ? setRightPanelCollapsed(true) : openDrawer("queue")} aria-label={`Abrir fila, ${snapshot.queue.length} itens`} data-tooltip="Fila"><ListVideo size={20} />{snapshot.queue.length ? <span className="dock-badge">{snapshot.queue.length}</span> : null}</button><button className="dock-button subtle" onClick={() => setShowCallSettings(true)} aria-label="Configurações de áudio" data-tooltip="Configurações de áudio"><SlidersHorizontal size={19} /></button><span className="dock-separator" /><button className="primary-action dock-add" onClick={() => setShowMediaHub(true)}><Plus size={18} /> Adicionar mídia</button></div>
      </footer>
    </main>

    {showMediaHub ? <MediaHub apiUrl={API_URL} token={session.token} roomId={snapshot.id} queueLength={snapshot.queue.length} queueRevision={snapshot.queueRevision} refreshSignal={mediaHubRevision} onClose={() => setShowMediaHub(false)} onAdd={addMedia} onPlayNext={playMediaNext} /> : null}
    {confirmClearQueue ? <div className="dialog-backdrop"><section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-queue-title"><h2 id="clear-queue-title">Limpar a fila?</h2><p>A mídia atual continua tocando. Os próximos itens serão removidos para todos.</p><div className="dialog-actions"><button onClick={() => setConfirmClearQueue(false)}>Cancelar</button><button className="danger-action" onClick={clearQueue}>Limpar fila</button></div></section></div> : null}
    {showInvite && house ? <InviteDialog apiUrl={API_URL} token={session.token} house={house} onClose={() => setShowInvite(false)} onChanged={(next) => setHouse(next)} /> : null}
    {showHouseSettings && house ? <HouseSettingsDialog apiUrl={API_URL} token={session.token} house={house} currentUserId={session.user.id} roomSettings={snapshot.settings} onRoomSettings={(settings) => socket?.emit(eventNames.roomSettings, { roomId: snapshot.id, settings })} onClose={() => setShowHouseSettings(false)} onChanged={(next) => { setHouse(next); void refreshHouses(); }} /> : null}
    {showProfile ? <ProfileDialog apiUrl={API_URL} token={session.token} user={session.user} onClose={() => setShowProfile(false)} onSaved={(user) => { const nextSession = { ...session, user }; setSession(nextSession); localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession)); }} /> : null}
    {showCallSettings ? <CallSettings settings={audioSettings} devices={audioDevices} micLevel={micLevel} connected={micEnabled} outputSelectionSupported={"setSinkId" in HTMLMediaElement.prototype} onChange={setAudioSettings} onLeaveCall={() => { void toggleMic(); setShowCallSettings(false); }} onClose={() => setShowCallSettings(false)} /> : null}
  </div></Suspense>;
}

function LoadingScreen({ user, connectionState, onLogout }: { user: User; connectionState: string; onLogout: () => void }) {
  return <main className="loading-screen"><span className="brand-symbol">L</span><h1>Preparando a Party</h1><p>{connectionState === "offline" ? "A API não respondeu. Verifique se o servidor está rodando." : `Só um instante, ${user.displayName}.`}</p><button onClick={onLogout}>Voltar</button></main>;
}

function QueueList({ queue, currentKey, onPlay, onRemove, onMove, onNext, onPrevious, onAdd }: { queue: QueueItem[]; currentKey: string; onPlay: (item: QueueItem) => void; onRemove: (item: QueueItem) => void; onMove: (id: string, toIndex: number) => void; onNext: () => void; onPrevious: () => void; onAdd: () => void }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  if (!queue.length) return <div className="queue-empty"><Library size={28} aria-hidden="true" /><h3>A fila está vazia</h3><p>Escolha algo no Media Hub para começar.</p><button className="primary-action compact" onClick={onAdd}><Plus size={17} aria-hidden="true" /> Adicionar mídia</button></div>;
  return <><div className="queue-toolbar"><span>Ordem de reprodução</span><div><button className="icon-button" onClick={onPrevious} aria-label="Mídia anterior"><SkipBack /></button><button className="icon-button" onClick={onNext} aria-label="Próxima mídia"><SkipForward /></button></div></div><ol className="queue-list">{queue.map((item, index) => {
    const isCurrent = `${item.provider}:${item.providerMediaId}` === currentKey;
    return <li className={`queue-item ${isCurrent ? "current" : ""} ${draggedId === item.id ? "dragging" : ""} ${dragOverId === item.id ? "drop-target" : ""}`} key={item.id} draggable={!isCurrent} onDragStart={() => setDraggedId(item.id)} onDragEnter={() => setDragOverId(item.id)} onDragOver={(event) => event.preventDefault()} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }} onDrop={() => { if (draggedId && draggedId !== item.id) onMove(draggedId, index); setDraggedId(null); setDragOverId(null); }}>
      <button className="queue-play" onClick={() => onPlay(item)} aria-label={`Reproduzir ${item.title}`}>{isCurrent ? <Volume2 aria-hidden="true" /> : <span>{index + 1}</span>}</button>
      <div className="queue-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" width="96" height="54" loading="lazy" /> : <Library aria-hidden="true" />}</div>
      <div className="queue-copy"><strong>{item.title}</strong><span>{providerLabel(item.provider)} · {formatDuration(item.duration)} · {item.addedBy.displayName}</span></div>
      <div className="queue-actions"><button className="icon-button" onClick={() => onMove(item.id, Math.max(0, index - 1))} disabled={index === 0} aria-label={`Mover ${item.title} para cima`}><ChevronUp /></button><button className="icon-button" onClick={() => onMove(item.id, Math.min(queue.length - 1, index + 1))} disabled={index === queue.length - 1} aria-label={`Mover ${item.title} para baixo`}><ChevronDown /></button><button className="icon-button danger" onClick={() => onRemove(item)} aria-label={`Remover ${item.title}`}><Trash2 /></button></div>
    </li>;
  })}</ol></>;
}

function HistoryList({ history: items }: { history: HouseHistoryEntry[] }) {
  return <div className="history-panel"><div><History size={18} aria-hidden="true" /><strong>Reproduzidos recentemente</strong></div>{items.length ? <ul>{items.slice().reverse().map((item) => <li key={`${item.id}-history`}><span>{item.title}</span><small>{providerLabel(item.provider)} · {timeLabel(item.playedAt)}</small></li>)}</ul> : <p>Nenhuma mídia reproduzida ainda.</p>}</div>;
}

function ChatPanel({ messages, currentUser, typingNames, onTyping, onSend }: { messages: ChatMessage[]; currentUser: User; typingNames: string[]; onTyping: (typing: boolean) => void; onSend: (body: string) => void }) {
  const [draft, setDraft] = useState(""); const timer = useRef<number>();
  const changed = (value: string) => { setDraft(value); onTyping(Boolean(value)); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => onTyping(false), 1200); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.trim()) { onSend(draft); setDraft(""); onTyping(false); } };
  return <div className="chat-panel"><div className="messages" aria-live="polite">{messages.map((message) => <article className={`message ${message.user.id === currentUser.id ? "mine" : ""}`} key={message.id}><Avatar className="message-avatar" name={message.user.displayName} src={message.user.avatar} color={message.user.color} /><div><header><strong>{message.user.displayName}</strong><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></header><p>{message.body}</p></div></article>)}</div><div className="typing-indicator" aria-live="polite">{typingNames.length ? `${typingNames.slice(0, 2).join(" e ")} está digitando…` : ""}</div><form className="chat-form" onSubmit={submit}><label className="sr-only" htmlFor="chat-message">Mensagem</label><input id="chat-message" name="message" autoComplete="off" value={draft} onChange={(event) => changed(event.target.value)} placeholder="Escreva uma mensagem…" /><button disabled={!draft.trim()} aria-label="Enviar mensagem"><Send /></button></form></div>;
}

function MembersPanel({ members, currentUserId, participantVolumes, onVolume }: { members: HouseMember[]; currentUserId: string; participantVolumes: Record<string, number>; onVolume: (userId: string, volume: number) => void }) {
  const sections = [{ label: "Na Party", items: members.filter((m) => m.inParty) }, { label: "Online", items: members.filter((m) => !m.inParty && m.presence !== "OFFLINE") }, { label: "Offline", items: members.filter((m) => m.presence === "OFFLINE") }];
  return <div className="members-panel"><div className="members-summary"><Users size={20} aria-hidden="true" /><div><strong>{members.filter((m) => m.presence !== "OFFLINE").length} online</strong><span>{members.length} membros na Casa</span></div></div>{sections.map((section) => section.items.length ? <section className="people-section" key={section.label}><h3>{section.label} · {section.items.length}</h3><ul className="members-list">{section.items.map((member) => <li className={`member-row ${member.speaking ? "is-speaking" : ""} ${member.presence === "OFFLINE" ? "is-offline" : ""}`} key={member.user.id}><Avatar className="member-avatar" name={member.user.displayName} src={member.user.avatar} color={member.user.color} /><div className="member-copy"><div><strong>{member.user.displayName}{member.user.id === currentUserId ? " (você)" : ""}</strong>{member.role !== "MEMBER" ? <span className="role-badge">{member.role === "HOST" ? "Host" : "Admin"}</span> : null}</div><span>{member.screenSharing ? "Compartilhando tela" : member.speaking ? "Falando" : member.inCall ? "Na call" : member.inParty ? "Na Party" : member.presence === "IDLE" ? "Ausente" : member.presence === "OFFLINE" ? `Visto ${timeLabel(member.lastSeenAt)}` : member.user.status || "Online"}</span>{member.inCall && member.user.id !== currentUserId ? <label className="participant-volume"><span className="sr-only">Volume de {member.user.displayName}</span><Volume2 size={14} /><input type="range" min="0" max="100" value={participantVolumes[member.user.id] ?? 80} onChange={(event) => onVolume(member.user.id, Number(event.target.value))} /></label> : null}</div>{member.screenSharing ? <MonitorUp size={17} /> : member.speaking ? <span className="speaking-bars"><i /><i /><i /></span> : <span className="online-dot" />}</li>)}</ul></section> : null)}</div>;
}

function RoomSettingsDialog({ settings, onClose, onSave }: { settings: RoomSettings; onClose: () => void; onSave: (settings: RoomSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><h2 id="settings-title">Configurações da Party</h2><p>Defina quem pode controlar a mídia e a fila.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar configurações"><X /></button></header><label>Controle da mídia<select value={draft.mediaControl} onChange={(event) => setDraft((current) => ({ ...current, mediaControl: event.target.value as RoomSettings["mediaControl"] }))}><option value="host">Somente Host</option><option value="host-moderators">Host e moderadores</option><option value="everyone">Todos</option></select></label><label>Adicionar à fila<select value={draft.queueControl} onChange={(event) => setDraft((current) => ({ ...current, queueControl: event.target.value as RoomSettings["queueControl"] }))}><option value="host">Somente Host</option><option value="members">Membros</option><option value="everyone">Todos</option></select></label><label className="settings-check"><input type="checkbox" checked={draft.skipVotingEnabled} onChange={(event) => setDraft((current) => ({ ...current, skipVotingEnabled: event.target.checked }))} /> Ativar votação para pular</label><label>Limite de votos: {draft.skipVoteThreshold}%<input type="range" min="10" max="100" step="10" value={draft.skipVoteThreshold} disabled={!draft.skipVotingEnabled} onChange={(event) => setDraft((current) => ({ ...current, skipVoteThreshold: Number(event.target.value) }))} /></label><button className="primary-action" onClick={() => onSave(draft)}>Salvar configurações</button></section></div>;
}
