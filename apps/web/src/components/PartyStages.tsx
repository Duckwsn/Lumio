import { useEffect, useRef, type ReactNode } from "react";
import { MonitorUp, Radio, ScreenShare } from "lucide-react";
import type { ScreenShareState } from "@lumio/shared";

function SharedScreen({ state, stream }: { state: NonNullable<ScreenShareState>; stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="screen-share-stage">{stream ? <video ref={videoRef} autoPlay playsInline /> : <div className="screen-waiting"><MonitorUp size={36} aria-hidden="true" /><strong>Conectando à tela de {state.user.displayName}</strong><span>O compartilhamento aparecerá em instantes.</span></div>}<footer><span className="avatar" style={{ background: state.user.color }}>{state.user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{state.user.displayName} está compartilhando a tela</strong><span>Áudio da call continua independente</span></div></footer></div>;
}

export function MediaExperienceStage({ media, screenShare, screenStream, view, onViewChange }: {
  media: ReactNode; screenShare: ScreenShareState; screenStream: MediaStream | null;
  view: "media" | "screen"; onViewChange: (view: "media" | "screen") => void;
}) {
  return <section className="main-stage media-experience" data-view={view} aria-label="Palco de mídia">
    {screenShare ? <div className="stage-switcher" role="group" aria-label="Escolher visualização"><button className={view === "screen" ? "active" : ""} onClick={() => onViewChange("screen")}><ScreenShare size={16} aria-hidden="true" /> Tela compartilhada</button><button className={view === "media" ? "active" : ""} onClick={() => onViewChange("media")}><Radio size={16} aria-hidden="true" /> Mídia</button></div> : null}
    <div className={view === "media" ? "stage-layer active" : "stage-layer hidden"} aria-hidden={view !== "media"} {...(view !== "media" ? { inert: "" } : {})}>{media}</div>
    {screenShare && view === "screen" ? <div className="stage-layer active"><SharedScreen state={screenShare} stream={screenStream} /></div> : null}
  </section>;
}
