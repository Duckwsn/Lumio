import { useEffect, useRef, type ReactNode } from "react";
import { MonitorUp, Radio, ScreenShare } from "lucide-react";
import type { ScreenShareState } from "@lumio/shared";

export type MainStageView = "media" | "screen";

export function MainStage({ media, screenShare, screenStream, view, onViewChange }: {
  media: ReactNode;
  screenShare: ScreenShareState;
  screenStream: MediaStream | null;
  view: MainStageView;
  onViewChange: (view: MainStageView) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = screenStream;
    if (screenStream) void videoRef.current.play().catch(() => undefined);
    return () => { if (videoRef.current) videoRef.current.srcObject = null; };
  }, [screenStream, view]);

  return <section className="main-stage" aria-label="Palco principal">
    {screenShare ? <div className="stage-switcher" role="group" aria-label="Escolher visualização"><button className={view === "screen" ? "active" : ""} onClick={() => onViewChange("screen")}><ScreenShare size={16} aria-hidden="true" /> Tela compartilhada</button><button className={view === "media" ? "active" : ""} onClick={() => onViewChange("media")}><Radio size={16} aria-hidden="true" /> Mídia</button></div> : null}
    <div className={view === "media" ? "stage-layer active" : "stage-layer hidden"}>{media}</div>
    {screenShare ? <div className={view === "screen" ? "stage-layer active" : "stage-layer hidden"}><div className="screen-share-stage">{screenStream ? <video ref={videoRef} autoPlay playsInline /> : <div className="screen-waiting"><MonitorUp size={36} aria-hidden="true" /><strong>Conectando à tela de {screenShare.user.displayName}</strong><span>O compartilhamento aparecerá em instantes.</span></div>}<footer><span className="avatar" style={{ background: screenShare.user.color }}>{screenShare.user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{screenShare.user.displayName} está compartilhando a tela</strong><span>Áudio da call continua independente</span></div></footer></div></div> : null}
  </section>;
}
