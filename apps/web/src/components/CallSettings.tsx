import { Headphones, Mic, X } from "lucide-react";

export type MicrophoneMode = "voice" | "ptt";

export interface LocalAudioSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  microphoneMode: MicrophoneMode;
  mediaVolume: number;
  callVolume: number;
  duckingEnabled: boolean;
  duckingVolume: number;
}

export function CallSettings({ settings, devices, micLevel, connected, outputSelectionSupported, onChange, onLeaveCall, onClose }: {
  settings: LocalAudioSettings;
  devices: MediaDeviceInfo[];
  micLevel: number;
  connected: boolean;
  outputSelectionSupported: boolean;
  onChange: (settings: LocalAudioSettings) => void;
  onLeaveCall: () => void;
  onClose: () => void;
}) {
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  const update = <K extends keyof LocalAudioSettings>(key: K, value: LocalAudioSettings[K]) => onChange({ ...settings, [key]: value });
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog call-settings" role="dialog" aria-modal="true" aria-labelledby="audio-settings-title"><header><div><h2 id="audio-settings-title">Áudio da call</h2><p>Preferências locais para microfone, saída e mídia.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar configurações de áudio"><X /></button></header>
    <label><span><Mic size={15} aria-hidden="true" /> Microfone</span><select value={settings.inputDeviceId} onChange={(event) => update("inputDeviceId", event.target.value)}><option value="">Padrão do sistema</option>{inputs.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
    <label><span><Headphones size={15} aria-hidden="true" /> Saída de áudio</span><select value={settings.outputDeviceId} disabled={!outputSelectionSupported} onChange={(event) => update("outputDeviceId", event.target.value)}><option value="">Padrão do sistema</option>{outputs.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Saída ${index + 1}`}</option>)}</select>{!outputSelectionSupported ? <small>Seu navegador não permite escolher a saída.</small> : null}</label>
    <fieldset><legend>Modo do microfone</legend><label className="radio-row"><input type="radio" name="mic-mode" checked={settings.microphoneMode === "voice"} onChange={() => update("microphoneMode", "voice")} /> Detecção normal</label>{!window.matchMedia("(pointer: coarse)").matches ? <label className="radio-row"><input type="radio" name="mic-mode" checked={settings.microphoneMode === "ptt"} onChange={() => update("microphoneMode", "ptt")} /> Push-to-talk <kbd>V</kbd></label> : <small>Push-to-talk por teclado não está disponível em telas touch.</small>}</fieldset>
    <div className="mic-test"><span>Teste do microfone</span><div aria-label={`Nível do microfone ${Math.round(micLevel)}%`}><i style={{ width: `${micLevel}%` }} /></div></div>
    <label>Volume da mídia: {settings.mediaVolume}%<input type="range" min="0" max="100" value={settings.mediaVolume} onChange={(event) => update("mediaVolume", Number(event.target.value))} /></label>
    <label>Volume da call: {settings.callVolume}%<input type="range" min="0" max="100" value={settings.callVolume} onChange={(event) => update("callVolume", Number(event.target.value))} /></label>
    <label className="settings-check"><input type="checkbox" checked={settings.duckingEnabled} onChange={(event) => update("duckingEnabled", event.target.checked)} /> Reduzir mídia quando alguém fala</label>
    <label>Reduzir mídia para: {settings.duckingVolume}%<input type="range" min="10" max="80" value={settings.duckingVolume} disabled={!settings.duckingEnabled} onChange={(event) => update("duckingVolume", Number(event.target.value))} /></label>
    <div className="call-settings-actions">{connected ? <button className="leave-call-action" onClick={onLeaveCall}>Sair da call</button> : null}<button className="primary-action" onClick={onClose}>Concluir</button></div>
  </section></div>;
}
