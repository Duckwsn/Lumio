import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Headphones, MessageCircle, Mic, MicOff, MonitorUp, ScreenShareOff, Settings2, Users, X } from "lucide-react";

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
  partyTriggerRef: MutableRefObject<HTMLButtonElement | null>;
  chatTriggerRef: MutableRefObject<HTMLButtonElement | null>;
}

export function PartySocialControls(props: PartySocialControlsProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const connected = props.callState === "connected";
  const micOn = connected && props.micEnabled && !props.muted && !props.deafened;
  const micBlocked = props.voiceError.startsWith("Microfone bloqueado");
  const callLabel = props.callState === "reconnecting" ? "Reconectando voz" : props.callState === "joining" ? "Conectando voz" : connected ? "Call conectada" : props.voiceError ? "Call indisponível" : "Call desligada";
  const micStatus = micBlocked ? "Microfone bloqueado" : props.deafened ? "Áudio da call desligado" : micOn ? props.microphoneMode === "ptt" ? "Push-to-talk ativo" : props.speaking ? "Você está falando" : "Microfone ligado" : "Microfone desligado";
  const micAction = micOn ? "Desativar microfone" : "Ativar microfone";
  const close = () => { setOpen(false); requestAnimationFrame(() => props.partyTriggerRef.current?.focus()); };

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  return <footer ref={root} className="party-dock party-social-edge" aria-label="Controles sociais da Party">
    <div className="social-compact" role="group" aria-label="Call, chat e Party">
      {props.callState === "idle" ? <button type="button" className="social-call-join" onClick={props.onRetryVoice} aria-label="Entrar na Call, microfone desligado" title="Entrar na Call"><span aria-hidden="true" />Entrar na Call</button> : <span className={`social-call-status ${connected ? "is-connected" : ""}`} role="status" aria-label={callLabel}><span aria-hidden="true" />{callLabel}</span>}
      {connected ? <button type="button" className={`social-mic ${micOn ? "is-on" : ""} ${micBlocked ? "is-blocked" : ""}`} onClick={props.onMic} aria-label={`${micAction} · ${micStatus}`} aria-pressed={micOn} title={`${micAction} · ${micStatus}`}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}<span>{micBlocked ? "Bloqueado" : micOn ? "Mic ligado" : "Mic desligado"}</span></button> : null}
      <button ref={props.chatTriggerRef} type="button" className={`social-chat-trigger ${props.chatOpen ? "is-active" : ""}`} onClick={props.onChat} aria-label={props.unreadChat ? `Abrir chat, ${props.unreadChat} não lidas` : props.chatOpen ? "Fechar chat" : "Abrir chat"} aria-expanded={props.chatOpen} title={props.unreadChat ? `Chat · ${props.unreadChat} não lidas` : "Chat"}><MessageCircle size={18} /><span>Chat</span>{props.unreadChat ? <b aria-hidden="true">{Math.min(props.unreadChat, 99)}</b> : null}</button>
      <button ref={props.partyTriggerRef} type="button" className={`social-party-trigger ${open ? "is-active" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Abrir controles da Party" aria-expanded={open} aria-controls="party-social-menu" title="Controles da Party"><Users size={18} /><span>Party</span></button>
      {props.isSharingScreen ? <button type="button" className="social-sharing-active" onClick={props.onShare} aria-label="Parar compartilhamento de tela" title="Parar compartilhamento"><ScreenShareOff size={18} /><span>Compartilhando</span></button> : null}
    </div>
    {open ? <div className="party-social-menu" id="party-social-menu" role="group" aria-label="Controles da Party">
      <header><div><strong>Na Party · {props.peopleCount}</strong><span>{callLabel} · {micStatus}{connected && props.callQuality !== "Calculando" ? ` · ${props.callQuality}` : ""}</span></div><button ref={closeButton} type="button" onClick={close} aria-label="Fechar controles da Party"><X size={18} /></button></header>
      {props.voiceError ? <p className="social-voice-error" role="alert">{props.voiceError}{micBlocked ? <span> Verifique a permissão do microfone nas configurações do navegador e tente novamente.</span> : null}</p> : null}
      {props.callState === "idle" ? <button type="button" onClick={() => { props.onRetryVoice(); setOpen(false); }}>Entrar na Call · microfone desligado</button> : null}
      {props.audioBlocked ? <button type="button" onClick={() => { props.onEnableAudio(); setOpen(false); }}><Headphones size={18} />Ativar áudio da call</button> : null}
      {connected ? <button type="button" onClick={() => { props.onDeafen(); setOpen(false); }} aria-pressed={props.deafened}><Headphones size={18} />{props.deafened ? "Ativar áudio da call" : "Desativar áudio da call"}</button> : null}
      <button type="button" onClick={() => { props.partyTriggerRef.current?.focus(); props.onPeople(); setOpen(false); }}><Users size={18} />Pessoas na Party <span>{props.peopleCount}</span></button>
      {connected && props.canShare ? <button type="button" disabled={props.shareOccupied} onClick={() => { props.onShare(); setOpen(false); }}>{props.isSharingScreen ? <ScreenShareOff size={18} /> : <MonitorUp size={18} />}{props.isSharingScreen ? "Parar compartilhamento" : props.shareOccupied ? "Alguém está compartilhando" : "Compartilhar tela"}</button> : null}
      <button type="button" onClick={() => { props.onSettings(); setOpen(false); }}><Settings2 size={18} />Call e dispositivos</button>
    </div> : null}
  </footer>;
}
