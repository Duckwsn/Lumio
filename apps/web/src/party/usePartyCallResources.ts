import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalAudioSettings } from "../components/CallSettings";

/** RTC resources belong to the Party lifetime, never to MainStage or a provider. */
export function usePartyCallResources() {
  const [voiceError, setVoiceError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [callState, setCallState] = useState<"idle" | "joining" | "connected" | "reconnecting" | "leaving" | "error">("idle");
  const [muted, setMuted] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioSettings, setAudioSettings] = useState<LocalAudioSettings>(() => {
    const defaults: LocalAudioSettings = { inputDeviceId: "", outputDeviceId: "", microphoneMode: "voice", mediaVolume: 100, callVolume: 100, duckingEnabled: true, duckingVolume: 40 };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem("lumio.audio.v1") ?? "{}") }; } catch { return defaults; }
  });
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [callQuality, setCallQuality] = useState<"Calculando" | "Excelente" | "Boa" | "Instável">("Calculando");
  const micLevelRef = useRef(0);
  const getMicLevel = useCallback(() => micLevelRef.current, []);
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

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { deafenedRef.current = deafened; }, [deafened]);
  useEffect(() => { audioSettingsRef.current = audioSettings; localStorage.setItem("lumio.audio.v1", JSON.stringify(audioSettings)); }, [audioSettings]);
  useEffect(() => { participantVolumesRef.current = participantVolumes; }, [participantVolumes]);
  useEffect(() => { if (window.matchMedia("(pointer: coarse)").matches) setAudioSettings((current) => current.microphoneMode === "ptt" ? { ...current, microphoneMode: "voice" } : current); }, []);

  return {
    voiceError, setVoiceError, audioBlocked, setAudioBlocked, micEnabled, setMicEnabled,
    callState, setCallState, muted, setMuted, deafened, setDeafened, speaking, setSpeaking,
    participantVolumes, setParticipantVolumes, audioDevices, setAudioDevices, audioSettings, setAudioSettings,
    localScreenStream, setLocalScreenStream, remoteScreenStream, setRemoteScreenStream,
    callQuality, setCallQuality, micLevelRef, getMicLevel, localStream, peerConnections,
    peerSessions, rtcConfiguration, callActiveRef, callGeneration, micRequestInFlight,
    resetPeers, joinCallRef, remoteAudio, analyserCleanup, displayStream,
    mutedRef, deafenedRef, audioSettingsRef, participantVolumesRef,
  };
}
