import type { MutableRefObject } from "react";
import { Headphones, HeadphoneOff, MessageCircle, Mic, MicOff, MonitorUp, ScreenShareOff, Settings2, Users } from "lucide-react";

interface PartySocialControlsProps {
  callState: string;
  callQuality: string;
  voiceError: string;
  micEnabled: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  microphoneMode: "voice" | "ptt";
  audioBlocked: boolean;
  isSharingScreen: boolean;
  shareOccupied: boolean;
  canShare: boolean;
  peopleCount: number;
  unreadChat: number;
  chatOpen: boolean;
  onMic: () => void;
  onDeafen: () => void;
  onShare: () => void;
  onChat: () => void;
  onPeople: () => void;
  onSettings: () => void;
  onEnableAudio: () => void;
  onRetryVoice: () => void;
  settingsTriggerRef: MutableRefObject<HTMLButtonElement | null>;
  chatTriggerRef: MutableRefObject<HTMLButtonElement | null>;
}

export function PartySocialControls(props: PartySocialControlsProps) {
  const connected = props.callState === "connected";
  const micOn = connected && props.micEnabled && !props.muted && !props.deafened;
  const micBlocked = props.voiceError.startsWith("Microfone bloqueado");
  const callLabel = props.callState === "reconnecting" ? "Reconectando voz" : props.callState === "joining" ? "Conectando voz" : connected ? "Call conectada" : props.voiceError ? "Call indisponível" : "Call desligada";
  const micStatus = micBlocked ? "Microfone bloqueado" : props.deafened ? "Áudio da call desligado" : micOn ? props.microphoneMode === "ptt" ? "Push-to-talk ativo" : props.speaking ? "Você está falando" : "Microfone ligado" : "Microfone desligado";
  const micAction = micOn ? "Desativar microfone" : "Ativar microfone";
  const audioLabel = props.audioBlocked || props.deafened ? "Ativar áudio da call" : "Desativar áudio da call";
  const shareLabel = props.isSharingScreen ? "Parar compartilhamento de tela" : props.shareOccupied ? "Alguém está compartilhando" : "Compartilhar tela";
  return <footer className="party-dock party-social-edge" aria-label="Controles sociais da Party">
    <span className={`social-call-status ${connected ? "sr-only" : ""}`} role="status" aria-label={callLabel}>{callLabel}</span>
    {props.callState === "idle" ? <button type="button" className="social-call-join" onClick={props.onRetryVoice} aria-label="Entrar na Call, microfone desligado">Entrar na Call</button> : null}
    {props.voiceError ? <p className="social-voice-error" role="alert">{micBlocked ? "Microfone bloqueado. Revise a permissão no navegador e tente novamente." : props.voiceError}</p> : null}
    <div className="social-compact" role="group" aria-label="Microfone, áudio, chat, tela e pessoas">
      <button type="button" disabled={!connected} className={`social-mic ${micOn ? "is-on" : ""} ${micBlocked ? "is-blocked" : ""}`} onClick={props.onMic} aria-label={`${micAction} · ${micStatus}`} aria-pressed={micOn} title={`${micAction} · ${micStatus}`}>{micOn ? <Mic size={20} /> : <MicOff size={20} />}</button>
      <button type="button" disabled={!connected} className={props.deafened || props.audioBlocked ? "is-active" : ""} onClick={props.audioBlocked ? props.onEnableAudio : props.onDeafen} aria-label={audioLabel} aria-pressed={props.deafened} title={audioLabel}>{props.deafened || props.audioBlocked ? <HeadphoneOff size={20} /> : <Headphones size={20} />}</button>
      <button ref={props.chatTriggerRef} type="button" className={`social-chat-trigger ${props.chatOpen ? "is-active" : ""}`} onClick={props.onChat} aria-label={props.unreadChat ? `Abrir chat, ${props.unreadChat} não lidas` : props.chatOpen ? "Ocultar chat" : "Abrir chat"} aria-expanded={props.chatOpen} title={props.unreadChat ? `Chat · ${props.unreadChat} não lidas` : "Chat"}><MessageCircle size={20} />{props.unreadChat ? <b aria-hidden="true">{Math.min(props.unreadChat, 99)}</b> : null}</button>
      {props.canShare ? <button type="button" className={props.isSharingScreen ? "social-sharing-active is-active" : ""} disabled={!connected || props.shareOccupied} onClick={props.onShare} aria-label={shareLabel} aria-pressed={props.isSharingScreen} title={shareLabel}>{props.isSharingScreen ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />}</button> : null}
      <button type="button" className="social-people-trigger" onClick={props.onPeople} aria-label={`Pessoas na Party, ${props.peopleCount}`} title={`Pessoas na Party · ${props.peopleCount}`}><Users size={20} /><b aria-hidden="true">{props.peopleCount}</b></button>
      <button ref={props.settingsTriggerRef} type="button" onClick={props.onSettings} aria-label="Call e dispositivos" title={`Call e dispositivos · ${callLabel}${connected && props.callQuality !== "Calculando" ? ` · ${props.callQuality}` : ""}`}><Settings2 size={20} /></button>
    </div>
  </footer>;
}
